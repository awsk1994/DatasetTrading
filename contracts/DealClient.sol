// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.13;

// import {StdStorage} from "../lib/forge-std/src/Components.sol";
import {specific_authenticate_message_params_parse, specific_deal_proposal_cbor_parse} from "./CBORParse.sol";

// import "https://github.com/foundry-rs/forge-std/blob/5bafa16b4a6aa67c503d96294be846a22a6f6efb/src/StdStorage.sol";
// import "https://github.com/lotus-web3/client-contract/blob/main/src/CBORParse.sol";


contract MockMarket {
    function publish_storage_deals(bytes memory raw_auth_params, address callee) public {
        // // calls standard filecoin receiver on message authentication api method number
        (bool success,) = callee.call(abi.encodeWithSignature("handle_filecoin_method(uint64,uint64,bytes)", 0, 2643134072, raw_auth_params));
        require(success, "client contract failed to authorize deal publish");
    }
}

contract DealClient {
    uint64 constant public AUTHORIZE_MESSAGE_METHOD_NUM = 2643134072;
    uint64 constant public DATACAP_RECEIVER_HOOK_METHOD_NUM = 3726118371;

    event ReceivedDataCap(string received);
    event addCIDE(bytes cidraw);
    event authorizeSPE(bytes cidraw, bytes provider);
    event publishDealE();

    // proposal attributes
    string public description;
    string public example;
    uint64 public initialInvestmentTarget;
    uint64 public invested;
    uint64 public purchasePrice;
    
    enum State{INVESTING, UPLOADING, PURCHASABLE, REFUNDING, CLOSED }
    State public state;

    bytes private cidRaw;

    address[] public investors;
    mapping(address => uint64) public investments;
    address[] public purchasers;
    address public provider;
    bytes public SP;

    // events
    event investE(address investor, uint64 amount, uint64 shares);
    event refundExcessE(address refundee, uint64 amount);
    event refundE(address investor, uint64 refund);

    constructor(string memory _description, string memory _example, uint64 _initialInvestmentTarget, uint64 _purchasePrice) {
        provider = msg.sender;
        state = State.INVESTING;
        description = _description;
        example = _example;
        initialInvestmentTarget = _initialInvestmentTarget;
        purchasePrice = _purchasePrice;
    }

    // @notice investor's 'invest' action
    // @returns share percentage
    function invest() public payable {
        require(msg.value > 0, "Cannot invest in 0 amount");
        require(state == State.INVESTING, "Unable to invest because state is no longer in 'investing'");
        invested += uint64(msg.value);
        if (!existInvestor(msg.sender)) {
            investors.push(msg.sender);
        }
        investments[msg.sender] += uint64(msg.value);

        if (invested >= initialInvestmentTarget) {
            state = State.UPLOADING;

            uint64 excess = invested - initialInvestmentTarget;
            if (excess > 0) {
                payable(msg.sender).transfer(excess);
                emit refundExcessE(msg.sender, uint64(msg.value));
            }
        }

        uint64 shares = uint64(msg.value)/initialInvestmentTarget;
        emit investE(msg.sender, uint64(msg.value), shares);
    }

    function getInvestor(address addr) public view returns (uint64) {
        return investments[addr];
    }

    // @notice cancel smart contract, refund all investors
    function cancel() public {
        require(msg.sender == provider, "Only provider can close proposal");
        require(state == State.INVESTING, "state must be 'INVESTING' to run this"); // TODO: what happens if cancel during 'PURCHASABLE'?
        state = State.REFUNDING;

        for (uint i=0; i<investors.length; i++) {
            address investor = investors[i];
            uint64 refund = investments[investor];
            payable(investor).transfer(refund);
            emit refundE(investor, refund);
        }

        state = State.CLOSED;
    }

    // @notice buyer purchases dataset (after uploaded to filecoin network)
    function purchase() public payable {
        // TODO: data provider/investors cannot call this
        require(state == State.PURCHASABLE, "state must be 'PURCHASABLE' to run this");
        require(uint64(msg.value) == purchasePrice, "Money sent does not equal purchasePrice");
        require(!existInvestor(msg.sender) && !existProvider(msg.sender), "sender is investor or provider, already have access, thus no need to purchase");
        purchasers.push(msg.sender);

        uint dividend = purchasePrice/investors.length;
        for (uint i=0; i<investors.length; i++) {
            address investor = investors[i];
            payable(investor).transfer(dividend);
        }
    }

    // // @notice only purchasers, providers and investors have access
    // function getCID() public view returns (bytes memory) {
    //     require(existPurchaser(msg.sender) || existPurchaser(msg.sender) || existProvider(msg.sender), "No authorization to call this. Only investors, provider or purchasers have access.");
    //     return cidRaw;
    // }

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

    function authorizeSP(bytes calldata cidraw, bytes calldata _SP) public {
        // require(SP == _SP, "This is not an authorized SP"); // TODO: do later
        require(state == State.UPLOADING, "State must be 'loading' to run this");     
        SP = _SP;   
        cidRaw = cidraw;
        emit authorizeSPE(cidraw, _SP);
    }

    function handle_filecoin_method(uint64, uint64 method, bytes calldata params) public {
        if (method == AUTHORIZE_MESSAGE_METHOD_NUM) {
            bytes calldata deal_proposal_cbor_bytes = specific_authenticate_message_params_parse(params);
            specific_deal_proposal_cbor_parse(deal_proposal_cbor_bytes);
            // (bytes calldata cidraw, bytes calldata _SP,) = specific_deal_proposal_cbor_parse(deal_proposal_cbor_bytes);  // TODO
            // require(SP == _SP, "current _SP is not authorized");  // TODO
            // require(cidraw == cidRaw, "cidraw does not match");  // TODO
            emit publishDealE();
            state = State.PURCHASABLE;
        } else if (method == DATACAP_RECEIVER_HOOK_METHOD_NUM) {
             emit ReceivedDataCap("DataCap Received!");
        } else {
             revert("the filecoin method that was called is not handled");
        }
    }

    function getInvestors() public view returns (address[] memory) {
        return investors;
    }

    function getPurchasers() public view returns (address[] memory) {
        return purchasers;
    }
}
