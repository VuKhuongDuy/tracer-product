package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"produce-traceability/chaincode"
)

func main() {
	produceChaincode, err := contractapi.NewChaincode(&chaincode.SmartContract{})
	if err != nil {
		log.Panicf("Error creating produce-traceability chaincode: %v", err)
	}

	if err := produceChaincode.Start(); err != nil {
		log.Panicf("Error starting produce-traceability chaincode: %v", err)
	}
}
