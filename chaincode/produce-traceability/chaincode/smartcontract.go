// Package chaincode implements a traceability smart contract for agricultural
// produce. A lot is created by a farmer/cooperative and then moves through the
// supply chain (processor -> distributor -> retailer). Every custody change is
// appended as an immutable TraceEvent, so the full provenance of a lot can be
// reconstructed at any time. A regulator (e.g. Ministry of Agriculture) can
// recall a lot when a food-safety issue is found.
package chaincode

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// SmartContract provides functions for managing produce traceability lots.
type SmartContract struct {
	contractapi.Contract
}

// Stage is a step in the produce supply chain.
type Stage string

const (
	StageHarvested   Stage = "HARVESTED"
	StageProcessed   Stage = "PROCESSED"
	StageDistributed Stage = "DISTRIBUTED"
	StageRetail      Stage = "RETAIL"
	StageSold        Stage = "SOLD"
	StageRecalled    Stage = "RECALLED"
)

const (
	priceCollection = "tradePrice"
	piiCollection   = "farmerPII"
)

// PriceInfo là dữ liệu mật chỉ chia sẻ giữa các bên giao dịch (Org1+Org2).
type PriceInfo struct {
	BuyPrice  float64 `json:"buyPrice"`
	SellPrice float64 `json:"sellPrice"`
	Currency  string  `json:"currency"`
	Party     string  `json:"party"`
}

// FarmerPII là dữ liệu cá nhân nông dân, chỉ chia sẻ giữa HTX và cơ quan quản lý (Org1+Org3).
type FarmerPII struct {
	FullName     string `json:"fullName"`
	IDNumber     string `json:"idNumber"`
	Phone        string `json:"phone"`
	PlotLocation string `json:"plotLocation"`
}

// TraceEvent is one immutable step in a lot's journey through the supply chain.
type TraceEvent struct {
	Stage     Stage  `json:"stage"`
	Actor     string `json:"actor"`     // who took custody / performed the action
	ActorRole string `json:"actorRole"` // FARMER | PROCESSOR | DISTRIBUTOR | RETAILER | REGULATOR
	Location  string `json:"location"`
	Note      string `json:"note"`
	Timestamp string `json:"timestamp"` // derived from the transaction timestamp (deterministic)
	TxID      string `json:"txId"`      // mã giao dịch (tx hash) ghi sự kiện này lên sổ cái
}

// ProduceLot is the asset stored on the ledger.
type ProduceLot struct {
	DocType        string       `json:"docType"` // always "lot" — useful for rich queries
	ID             string       `json:"id"`
	ProductName    string       `json:"productName"`
	Origin         string       `json:"origin"` // growing region / farm
	FarmerID       string       `json:"farmerId"`
	HarvestDate    string       `json:"harvestDate"`
	QuantityKg     float64      `json:"quantityKg"`
	Certifications []string     `json:"certifications"`
	CurrentOwner   string       `json:"currentOwner"`
	CurrentStage   Stage        `json:"currentStage"`
	Recalled       bool         `json:"recalled"`
	RecallReason   string       `json:"recallReason,omitempty" metadata:",optional"`
	History        []TraceEvent `json:"history"`
}

// txTimestamp returns the transaction's timestamp in RFC3339. Using the tx
// timestamp (not time.Now) keeps endorsements deterministic across peers.
func (s *SmartContract) txTimestamp(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to read tx timestamp: %w", err)
	}
	return ts.AsTime().UTC().Format("2006-01-02T15:04:05Z"), nil
}

// CreateLot registers a new produce lot harvested by a farmer/cooperative.
func (s *SmartContract) CreateLot(ctx contractapi.TransactionContextInterface,
	id, productName, origin, farmerID, harvestDate string, quantityKg float64) error {

	if err := s.requireRole(ctx, "farmer"); err != nil {
		return err
	}
	certFarmer, err := s.clientFarmerID(ctx)
	if err != nil {
		return err
	}
	if farmerID != certFarmer {
		return fmt.Errorf("access denied: farmerID %q không khớp danh tính %q", farmerID, certFarmer)
	}

	exists, err := s.LotExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("lot %s already exists", id)
	}

	ts, err := s.txTimestamp(ctx)
	if err != nil {
		return err
	}

	lot := ProduceLot{
		DocType:        "lot",
		ID:             id,
		ProductName:    productName,
		Origin:         origin,
		FarmerID:       farmerID,
		HarvestDate:    harvestDate,
		QuantityKg:     quantityKg,
		Certifications: []string{},
		CurrentOwner:   farmerID,
		CurrentStage:   StageHarvested,
		Recalled:       false,
		History: []TraceEvent{{
			Stage:     StageHarvested,
			Actor:     farmerID,
			ActorRole: "FARMER",
			Location:  origin,
			Note:      "Thu hoạch và đăng ký lô",
			Timestamp: ts,
			TxID:      ctx.GetStub().GetTxID(),
		}},
	}

	if err := s.putLot(ctx, &lot); err != nil {
		return err
	}
	if err := s.writePrivateFromTransient(ctx, "pii", piiCollection, id); err != nil {
		return err
	}
	return s.writePrivateFromTransient(ctx, "price", priceCollection, id)
}

// AddCertification attaches a certification (e.g. VietGAP, quarantine pass) to a lot.
func (s *SmartContract) AddCertification(ctx contractapi.TransactionContextInterface,
	id, certification, issuedBy string) error {

	if err := s.requireRole(ctx, "regulator"); err != nil {
		return err
	}

	lot, err := s.ReadLot(ctx, id)
	if err != nil {
		return err
	}
	if lot.Recalled {
		return fmt.Errorf("lot %s is recalled and cannot be modified", id)
	}

	ts, err := s.txTimestamp(ctx)
	if err != nil {
		return err
	}

	lot.Certifications = append(lot.Certifications, certification)
	lot.History = append(lot.History, TraceEvent{
		Stage:     lot.CurrentStage,
		Actor:     issuedBy,
		ActorRole: "REGULATOR",
		Location:  "",
		Note:      "Đã cấp chứng nhận: " + certification,
		Timestamp: ts,
		TxID:      ctx.GetStub().GetTxID(),
	})

	return s.putLot(ctx, lot)
}

// TransferCustody moves a lot to the next party in the supply chain and records
// the step as an immutable trace event.
func (s *SmartContract) TransferCustody(ctx contractapi.TransactionContextInterface,
	id, newOwner, newOwnerRole, stage, location, note string) error {

	lot, err := s.ReadLot(ctx, id)
	if err != nil {
		return err
	}
	if lot.Recalled {
		return fmt.Errorf("lot %s is recalled and cannot be transferred", id)
	}

	role, err := s.clientRole(ctx)
	if err != nil {
		return err
	}
	if role == "farmer" {
		certFarmer, fErr := s.clientFarmerID(ctx)
		if fErr != nil {
			return fErr
		}
		if lot.FarmerID != certFarmer {
			return fmt.Errorf("access denied: nông dân %q không thể chuyển lô của %q", certFarmer, lot.FarmerID)
		}
	}

	ts, err := s.txTimestamp(ctx)
	if err != nil {
		return err
	}

	lot.CurrentOwner = newOwner
	lot.CurrentStage = Stage(stage)
	lot.History = append(lot.History, TraceEvent{
		Stage:     Stage(stage),
		Actor:     newOwner,
		ActorRole: newOwnerRole,
		Location:  location,
		Note:      note,
		Timestamp: ts,
		TxID:      ctx.GetStub().GetTxID(),
	})

	if err := s.putLot(ctx, lot); err != nil {
		return err
	}
	return s.writePrivateFromTransient(ctx, "price", priceCollection, id)
}

// RecallLot lets a regulator flag a lot for recall (e.g. contamination found).
func (s *SmartContract) RecallLot(ctx contractapi.TransactionContextInterface,
	id, regulator, reason string) error {

	if err := s.requireRole(ctx, "regulator"); err != nil {
		return err
	}

	lot, err := s.ReadLot(ctx, id)
	if err != nil {
		return err
	}

	ts, err := s.txTimestamp(ctx)
	if err != nil {
		return err
	}

	lot.Recalled = true
	lot.RecallReason = reason
	lot.CurrentStage = StageRecalled
	lot.History = append(lot.History, TraceEvent{
		Stage:     StageRecalled,
		Actor:     regulator,
		ActorRole: "REGULATOR",
		Location:  "",
		Note:      "Phát lệnh thu hồi: " + reason,
		Timestamp: ts,
		TxID:      ctx.GetStub().GetTxID(),
	})

	return s.putLot(ctx, lot)
}

// ReadLot returns the lot stored with the given id.
func (s *SmartContract) ReadLot(ctx contractapi.TransactionContextInterface, id string) (*ProduceLot, error) {
	lotJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read lot %s: %w", id, err)
	}
	if lotJSON == nil {
		return nil, fmt.Errorf("lot %s does not exist", id)
	}

	var lot ProduceLot
	if err := json.Unmarshal(lotJSON, &lot); err != nil {
		return nil, err
	}
	return &lot, nil
}

// GetLotProvenance returns the full ordered history (journey) of a lot.
func (s *SmartContract) GetLotProvenance(ctx contractapi.TransactionContextInterface, id string) ([]TraceEvent, error) {
	lot, err := s.ReadLot(ctx, id)
	if err != nil {
		return nil, err
	}
	return lot.History, nil
}

// GetAllLots returns every lot on the ledger.
func (s *SmartContract) GetAllLots(ctx contractapi.TransactionContextInterface) ([]*ProduceLot, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var lots []*ProduceLot
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		var lot ProduceLot
		if err := json.Unmarshal(queryResponse.Value, &lot); err != nil {
			continue // skip keys that are not lots
		}
		if lot.DocType == "lot" {
			lots = append(lots, &lot)
		}
	}
	return lots, nil
}

// QueryLotsByOwner returns all lots currently owned by the given party.
func (s *SmartContract) QueryLotsByOwner(ctx contractapi.TransactionContextInterface, owner string) ([]*ProduceLot, error) {
	all, err := s.GetAllLots(ctx)
	if err != nil {
		return nil, err
	}
	var filtered []*ProduceLot
	for _, lot := range all {
		if lot.CurrentOwner == owner {
			filtered = append(filtered, lot)
		}
	}
	return filtered, nil
}

// LotExists reports whether a lot with the given id is on the ledger.
func (s *SmartContract) LotExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	lotJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read lot %s: %w", id, err)
	}
	return lotJSON != nil, nil
}

// writePrivateFromTransient reads 1 key from the transient map; if present, writes to the collection.
func (s *SmartContract) writePrivateFromTransient(ctx contractapi.TransactionContextInterface, key, collection, lotID string) error {
	transient, err := ctx.GetStub().GetTransient()
	if err != nil {
		return fmt.Errorf("failed to read transient: %w", err)
	}
	raw, ok := transient[key]
	if !ok || len(raw) == 0 {
		return nil // no private data for this key -> skip
	}
	return ctx.GetStub().PutPrivateData(collection, lotID, raw)
}

// clientRole đọc attribute "role" trong certificate người gọi.
func (s *SmartContract) clientRole(ctx contractapi.TransactionContextInterface) (string, error) {
	role, found, err := ctx.GetClientIdentity().GetAttributeValue("role")
	if err != nil {
		return "", fmt.Errorf("failed to read role attribute: %w", err)
	}
	if !found {
		return "", fmt.Errorf("access denied: identity has no 'role' attribute")
	}
	return role, nil
}

// clientFarmerID đọc attribute "farmerId" trong certificate người gọi.
func (s *SmartContract) clientFarmerID(ctx contractapi.TransactionContextInterface) (string, error) {
	id, found, err := ctx.GetClientIdentity().GetAttributeValue("farmerId")
	if err != nil {
		return "", fmt.Errorf("failed to read farmerId attribute: %w", err)
	}
	if !found {
		return "", fmt.Errorf("access denied: identity has no 'farmerId' attribute")
	}
	return id, nil
}

// requireRole trả lỗi nếu role người gọi khác giá trị yêu cầu.
func (s *SmartContract) requireRole(ctx contractapi.TransactionContextInterface, want string) error {
	role, err := s.clientRole(ctx)
	if err != nil {
		return err
	}
	if role != want {
		return fmt.Errorf("access denied: requires role=%s, caller role=%s", want, role)
	}
	return nil
}

func (s *SmartContract) putLot(ctx contractapi.TransactionContextInterface, lot *ProduceLot) error {
	lotJSON, err := json.Marshal(lot)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(lot.ID, lotJSON)
}

// requireLotAccess áp đặt kiểm soát truy cập theo từng danh tính cho dữ liệu mật.
// Private data collection của Fabric chỉ phân quyền theo tổ chức (Org), nên mọi
// thành viên Org1 (kể cả nông dân khác) đều đọc được. Để nông dân B không xem
// được giá/PII của nông dân A, ta kiểm tra thêm ở tầng chaincode: nếu người gọi
// là nông dân thì farmerId của họ phải khớp chủ lô.
func (s *SmartContract) requireLotAccess(ctx contractapi.TransactionContextInterface, lotID string) error {
	role, err := s.clientRole(ctx)
	if err != nil {
		return err
	}
	if role != "farmer" {
		return nil // HTX, bán lẻ, cơ quan QL: phân quyền do collection của Fabric đảm nhận
	}
	lot, err := s.ReadLot(ctx, lotID)
	if err != nil {
		return err
	}
	certFarmer, err := s.clientFarmerID(ctx)
	if err != nil {
		return err
	}
	if lot.FarmerID != certFarmer {
		return fmt.Errorf("access denied: nông dân %q không thể xem dữ liệu mật của lô thuộc %q", certFarmer, lot.FarmerID)
	}
	return nil
}

// ReadPrice returns the private price info for a lot. Only Org1/Org2 can read; others are denied by Fabric.
func (s *SmartContract) ReadPrice(ctx contractapi.TransactionContextInterface, id string) (*PriceInfo, error) {
	if err := s.requireLotAccess(ctx, id); err != nil {
		return nil, err
	}
	data, err := ctx.GetStub().GetPrivateData(priceCollection, id)
	if err != nil {
		return nil, fmt.Errorf("cannot read tradePrice: %w", err)
	}
	if data == nil {
		return nil, fmt.Errorf("no price data for lot %s (or org has no access)", id)
	}
	var p PriceInfo
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ReadFarmerPII returns the farmer PII for a lot. Only Org1/Org3 can read; others are denied by Fabric.
func (s *SmartContract) ReadFarmerPII(ctx contractapi.TransactionContextInterface, id string) (*FarmerPII, error) {
	if err := s.requireLotAccess(ctx, id); err != nil {
		return nil, err
	}
	data, err := ctx.GetStub().GetPrivateData(piiCollection, id)
	if err != nil {
		return nil, fmt.Errorf("cannot read farmerPII: %w", err)
	}
	if data == nil {
		return nil, fmt.Errorf("no PII data for lot %s (or org has no access)", id)
	}
	var p FarmerPII
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
