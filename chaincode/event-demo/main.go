package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"event-demo/chaincode"
)

func main() {
	eventChaincode, err := contractapi.NewChaincode(&chaincode.SmartContract{})
	if err != nil {
		log.Panicf("Error creating event-demo chaincode: %v", err)
	}

	if err := eventChaincode.Start(); err != nil {
		log.Panicf("Error starting event-demo chaincode: %v", err)
	}
}