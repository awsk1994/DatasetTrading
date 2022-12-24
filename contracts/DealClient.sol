// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.13;

import {specific_authenticate_message_params_parse, specific_deal_proposal_cbor_parse} from "./CBORParse.sol";

contract MockMarket {
    function publish_storage_deals(bytes memory raw_auth_params, address callee) public {
        // calls standard filecoin receiver on message authentication api method number
        (bool success,) = callee.call(
            abi.encodeWithSignature("handle_filecoin_method(uint64,uint64,bytes)", 
                0, 
                2643134072, 
                raw_auth_params
            )
        );
        require(success, "client contract failed to authorize deal publish");
    }
}

enum DealClientState{INVESTING, UPLOADING, PURCHASABLE, REFUNDING, CLOSED }

contract DealClient {
    uint64 constant public AUTHORIZE_MESSAGE_METHOD_NUM = 2643134072;
    uint64 constant public DATACAP_RECEIVER_HOOK_METHOD_NUM = 3726118371;

    // Events
    event ReceivedDataCap(string received);

    // Contract constructor attributes
    string public description;
    string public example;
    uint64 public initialInvestmentTarget;
    uint64 public purchasePrice;
    
    // Contract variables
    uint64 public invested;
    address[] public investors;
    mapping(address => uint64) public investments;
    address[] public purchasers;
    address public provider;
    DealClientState public state;

    bytes public SP;
    bytes private cidRaw;

    constructor(string memory _description, string memory _example, uint64 _initialInvestmentTarget, uint64 _purchasePrice) {
        provider = msg.sender;
        state = DealClientState.INVESTING;
        description = _description;
        example = _example;
        initialInvestmentTarget = _initialInvestmentTarget;
        purchasePrice = _purchasePrice;
    }

    // @notice investor's 'invest' action
    function invest() public payable {
        require(msg.value > 0, "Cannot invest in 0 amount");
        require(state == DealClientState.INVESTING, "Unable to invest because state is no longer in 'investing'");
        invested += uint64(msg.value);
        if (!existInvestor(msg.sender)) {
            investors.push(msg.sender);
        }
        investments[msg.sender] += uint64(msg.value);

        if (invested >= initialInvestmentTarget) {
            state = DealClientState.UPLOADING;

            uint64 excess = invested - initialInvestmentTarget;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
            }
        }
    }

    function getInvestor(address addr) public view returns (uint64) {
        return investments[addr];
    }

    // @notice cancel smart contract, refund all investors
    function cancel() public {
        require(msg.sender == provider, "Only provider can close proposal");
        require(state == DealClientState.INVESTING, "state must be 'INVESTING' to run this"); // TODO: what happens if cancel during 'PURCHASABLE'?
        state = DealClientState.REFUNDING;

        for (uint i=0; i<investors.length; i++) {
            address investor = investors[i];
            uint64 refund = investments[investor];
            payable(investor).transfer(refund);
        }

        state = DealClientState.CLOSED;
    }

    // @notice buyer purchases dataset (after uploaded to filecoin network)
    // TODO: divident should be based on investor's share(share = investor's investment / initialInvestmentTarget)
    function purchase() public payable {
        // TODO: data provider/investors cannot call this
        require(state == DealClientState.PURCHASABLE, "state must be 'PURCHASABLE' to run this");
        require(uint64(msg.value) == purchasePrice, "Money sent does not equal purchasePrice");
        require(!existInvestor(msg.sender) && !existProvider(msg.sender), 
            "sender is investor or provider, already have access, thus no need to purchase");
        purchasers.push(msg.sender);

        uint dividend = purchasePrice/investors.length;
        for (uint i=0; i<investors.length; i++) {
            address investor = investors[i];
            payable(investor).transfer(dividend);
        }
    }

    // @notice for provider to authorize cidraw and SP
    function authorizeSP(bytes calldata cidraw, bytes calldata _SP) public {
        require(state == DealClientState.UPLOADING, "State must be 'loading' to run this");     
        SP = _SP;   
        cidRaw = cidraw;
    }

    function handle_filecoin_method(uint64, uint64 method, bytes calldata params) public {
        if (method == AUTHORIZE_MESSAGE_METHOD_NUM) {
            bytes calldata deal_proposal_cbor_bytes = specific_authenticate_message_params_parse(params);
            specific_deal_proposal_cbor_parse(deal_proposal_cbor_bytes);
            (bytes calldata _cidraw, bytes calldata _SP,) = specific_deal_proposal_cbor_parse(deal_proposal_cbor_bytes);
            require(keccak256(abi.encodePacked(SP)) == keccak256(abi.encodePacked(_SP)), "current _SP is not authorized");
            require(keccak256(abi.encodePacked(cidRaw)) == keccak256(abi.encodePacked(_cidraw)), "cidraw does not match");
            state = DealClientState.PURCHASABLE;
        } else if (method == DATACAP_RECEIVER_HOOK_METHOD_NUM) {
             emit ReceivedDataCap("DataCap Received!");
        } else {
             revert("the filecoin method that was called is not handled");
        }
    }

    // GETTERS
    function getInvestors() public view returns (address[] memory) {
        return investors;
    }

    function getPurchasers() public view returns (address[] memory) {
        return purchasers;
    }

    // Helper Function: Exist
    function existPurchaser(address addr) private view  returns (bool) {
        for (uint i=0; i<purchasers.length; i++) {
            if (purchasers[i] == addr) {
                return true;
            }
        }
        return false;
    }

    function existInvestor(address addr) private view returns (bool) {
        for (uint i=0; i<investors.length; i++) {
            if (investors[i] == addr) {
                return true;
            }
        }
        return false;
    }

    function existProvider(address addr) private view returns (bool) {
        return addr == provider;
    }
}
