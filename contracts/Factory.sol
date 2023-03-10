// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import { DealClient } from "./DealClient.sol";

contract Factory{
    DealClient[] public dealClients;
    string[] public dealClientsDesc;

    function createClient(string memory _description, uint64 _initialInvestmentTarget, uint64 _purchasePrice) public {
        DealClient newDealClient = new DealClient(_description, "", _initialInvestmentTarget, _purchasePrice, msg.sender);
        dealClients.push(newDealClient);
        dealClientsDesc.push(_description);
    }

    function getClients() public view returns (DealClient[] memory) {
        return dealClients;
    }
    
    function getClientsDesc() public view returns (string[] memory) {
        return dealClientsDesc;
    }
}