// Package chaincode implements a minimal demo smart contract that stores
// generic events on the ledger and lets you read them back per user.
//
// It intentionally has no access control or private data — its only purpose is
// to demonstrate the two public functions SaveEvent and GetEvent.
package chaincode

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// eventIndex is the composite-key namespace used to index events per user.
// Keys look like: event~<userID>~<eventID>.
const eventIndex = "event"

// SmartContract provides the demo event functions.
type SmartContract struct {
	contractapi.Contract
}

// Event is a single record stored on the ledger.
type Event struct {
	DocType   string `json:"docType"`   // always "event"
	EventID   string `json:"eventId"`   // unique id of the event (per user)
	UserID    string `json:"userId"`    // owner of the event
	EventType string `json:"eventType"` // free-form category, e.g. LOGIN, PURCHASE
	Payload   string `json:"payload"`   // free-form data (JSON string, text, ...)
	Timestamp string `json:"timestamp"` // tx timestamp (deterministic, RFC3339)
	TxID      string `json:"txId"`      // transaction that wrote this event
}

// PaginatedEvents wraps one page of events plus the bookmark for the next page.
type PaginatedEvents struct {
	Events   []*Event `json:"events"`
	Bookmark string   `json:"bookmark"`
	Count    int32    `json:"count"`
}

// SaveEvent stores a new event for the given user.
//
// The on-ledger key is a composite key (event~userID~eventID) so that every
// event for a user can later be fetched with a single range scan in GetEvent.
func (s *SmartContract) SaveEvent(ctx contractapi.TransactionContextInterface,
	userID, eventID, eventType, payload string) (*Event, error) {

	if userID == "" || eventID == "" {
		return nil, fmt.Errorf("userID and eventID are required")
	}

	key, err := ctx.GetStub().CreateCompositeKey(eventIndex, []string{userID, eventID})
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read state: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("event %s already exists for user %s", eventID, userID)
	}

	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return nil, fmt.Errorf("failed to read tx timestamp: %w", err)
	}

	event := Event{
		DocType:   "event",
		EventID:   eventID,
		UserID:    userID,
		EventType: eventType,
		Payload:   payload,
		Timestamp: ts.AsTime().UTC().Format("2006-01-02T15:04:05Z"),
		TxID:      ctx.GetStub().GetTxID(),
	}

	eventJSON, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	if err := ctx.GetStub().PutState(key, eventJSON); err != nil {
		return nil, fmt.Errorf("failed to write event: %w", err)
	}
	return &event, nil
}

// GetEventByID returns the single event identified by userID and eventID.
func (s *SmartContract) GetEventByID(ctx contractapi.TransactionContextInterface,
	userID, eventID string) (*Event, error) {

	if userID == "" || eventID == "" {
		return nil, fmt.Errorf("userID and eventID are required")
	}

	key, err := ctx.GetStub().CreateCompositeKey(eventIndex, []string{userID, eventID})
	if err != nil {
		return nil, fmt.Errorf("failed to build composite key: %w", err)
	}

	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read state: %w", err)
	}
	if data == nil {
		return nil, fmt.Errorf("event %s not found for user %s", eventID, userID)
	}

	var event Event
	if err := json.Unmarshal(data, &event); err != nil {
		return nil, fmt.Errorf("failed to unmarshal event: %w", err)
	}
	return &event, nil
}

// GetEvent returns a paginated list of events for the given user, ordered by eventID.
//
// pageSize controls how many records to fetch per call (use 0 for no limit).
// bookmark is the cursor returned by the previous call; pass "" for the first page.
// The returned PaginatedEvents.Bookmark is the cursor for the next page (empty when done).
func (s *SmartContract) GetEvent(ctx contractapi.TransactionContextInterface,
	userID string, pageSize int32, bookmark string) (*PaginatedEvents, error) {

	if userID == "" {
		return nil, fmt.Errorf("userID is required")
	}

	if pageSize <= 0 {
		pageSize = 10
	}
	iterator, metadata, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(
		eventIndex, []string{userID}, pageSize, bookmark,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query events: %w", err)
	}
	defer iterator.Close()

	events := []*Event{}
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return nil, err
		}
		var event Event
		if err := json.Unmarshal(item.Value, &event); err != nil {
			continue // skip anything that is not a valid event record
		}
		events = append(events, &event)
	}

	return &PaginatedEvents{
		Events:   events,
		Bookmark: metadata.Bookmark,
		Count:    metadata.FetchedRecordsCount,
	}, nil
}