// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import { DealClient } from "./DealClient.sol";

contract Factory{
    DealClient[] public dealClients;

    event DealClientCreated(address addr, string description);

    function createClient(string memory _description, string memory _example, uint64 _initialInvestmentTarget, uint64 _purchasePrice) external {
        DealClient newDealClient = new DealClient(_description, _example, _initialInvestmentTarget, _purchasePrice);
        dealClients.push(newDealClient);
        emit DealClientCreated(address(newDealClient), _description);
    }

    function getClients() public view returns (DealClient[] memory) {
        return dealClients;
    }
}