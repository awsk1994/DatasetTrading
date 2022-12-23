const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(ganache.provider());

const {DealClient, MockMarket} = require('../compile');

const DealClientAbi = DealClient.abi;
const DealClientEvm = DealClient.evm;
const MockMarketAbi = MockMarket.abi;
const MockMarketEvm = MockMarket.evm;

const testCID = "0x000181E2039220206B86B273FF34FCE19D6B804EFF5A3F5747ADA4EAA22F1D49C01E52DDB7875B4B";
const testProvider = "0x0066";
const testmessageAuthParams ='0x8240584c8bd82a5828000181e2039220206b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b190800f4420068420066656c6162656c0a1a0008ca0a42000a42000a42000a';

const set_addr = "0xA235e3f07B934BcDe83f99fef19c6142EBCD7FAE";

let accounts;
let dealClient;
let mockMarket;

beforeEach(async () => {
  // Get a list of all accounts
  accounts = await web3.eth.getAccounts();
//   console.log("accounts", accounts)
//   let balance = await web3.eth.getBalance(accounts[0]);
//   console.log("account balance", balance );
  dealClient = await new web3.eth.Contract(DealClientAbi, set_addr)
    .deploy({
      data: DealClientEvm.bytecode.object,
      arguments: ['SOME_DESCRIPTION', 'SOME_EXAMPLE', 100, 1],
    })
    .send({ from: accounts[0], gasPrice: 8000000000, gas: 4700000 });
  mockMarket = await new web3.eth.Contract(MockMarketAbi)
    .deploy({
      data: MockMarketEvm.bytecode.object,
      arguments: [dealClient._address],
    })
    .send({ from: accounts[0], gasPrice: 8000000000, gas: 4700000 });
});

describe('DealClient', () => {
    it('initialization', async() => {
        let description = await dealClient.methods.description().call();
        assert.equal(description, 'SOME_DESCRIPTION');
        let example = await dealClient.methods.example().call();
        assert.equal(example, 'SOME_EXAMPLE');
        let initialInvestmentTarget = await dealClient.methods.initialInvestmentTarget().call();
        assert.equal(initialInvestmentTarget, 100);
        let purchasePrice = await dealClient.methods.purchasePrice().call();
        assert.equal(purchasePrice, 1);
        let invested = await dealClient.methods.invested().call();
        assert.equal(invested, 0);
    });
    it('invest, reach initialInvestmentTarget', async() => {
        await dealClient.methods.invest().send({
            from: accounts[1],
            value: 100,
            gasPrice: 8000000000,   // TODO
            gas: 4700000,           // TODO
        });
        let invested = await dealClient.methods.invested().call();
        assert.equal(invested, 100);
        let state = await dealClient.methods.state().call();
        assert.equal(state, 1);

        // console.log("dealClient address", dealClient._address, dealClient.options.address, set_addr)
        
        // TODO: Unable to test Mockmarket
        // await mockMarket.methods.
        //     publish_deal(testmessageAuthParams).
        //     call({
        //         'from': accounts[2],
        //     }, function(error, transactionHash){
        //         console.log("error", error);
        //         console.log("transactionHash", transactionHash);
        //     });
    });
});
