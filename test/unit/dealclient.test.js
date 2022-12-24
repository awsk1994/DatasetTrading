const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(ganache.provider());

const {
    DealClient,
    MockMarket
} = require('../../compile');

const DealClientAbi = DealClient.abi;
const DealClientEvm = DealClient.evm;
const MockMarketAbi = MockMarket.abi;
const MockMarketEvm = MockMarket.evm;

const testCID = "0x000181E2039220206B86B273FF34FCE19D6B804EFF5A3F5747ADA4EAA22F1D49C01E52DDB7875B4B";
const testProvider = "0x0066";
const testmessageAuthParams = '0x8240584c8bd82a5828000181e2039220206b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b190800f4420068420066656c6162656c0a1a0008ca0a42000a42000a42000a';

const set_addr = "0xA235e3f07B934BcDe83f99fef19c6142EBCD7FAE";

let accounts;
let dealClient;
let mockMarket;

let provider;
let investor1;
let investor2;
let sp;
let purchaser;
let purchaser2;

beforeEach(async () => {
    // Get a list of all accounts
    accounts = await web3.eth.getAccounts();
    provider = accounts[0];
    investor1 = accounts[1];
    investor2 = accounts[2];
    sp = accounts[3];
    purchaser = accounts[4];
    purchaser2 = accounts[5];

    //   console.log("accounts", accounts)
    //   let balance = await web3.eth.getBalance(accounts[0]);
    //   console.log("account balance", balance );
    dealClient = await new web3.eth.Contract(DealClientAbi, set_addr)
        .deploy({
            data: DealClientEvm.bytecode.object,
            arguments: ['SOME_DESCRIPTION', 'SOME_EXAMPLE', 100, 100],
        })
        .send({
            from: provider,
            gasPrice: 8000000000,
            gas: 4700000
        });
});

describe('DealClient', async () => {
  it('check init values', async () => {
    assert.equal(await dealClient.methods.description().call(), 'SOME_DESCRIPTION');
    assert.equal(await dealClient.methods.example().call(), 'SOME_EXAMPLE');
    assert.equal(await dealClient.methods.initialInvestmentTarget().call(), 100);
    assert.equal(await dealClient.methods.purchasePrice().call(), 1);
    assert.equal(await dealClient.methods.invested().call(), 0);
    purchasers = await dealClient.methods.getPurchasers().call();
    assert.equal(purchasers.length, 0);  
    investors = await dealClient.methods.getInvestors().call();
    assert.equal(investors.length, 0);  
  });

  it('Valid Case 1', async () => {
      // investor1 invests 50%
      await dealClient.methods.invest().send({
        from: investor1,
        value: 50,
        gasPrice: 8000000000, // TODO
        gas: 4700000, // TODO
      });
      it('should increment invested, but state remains as INVESTING', async() => {
        assert.equal(await dealClient.methods.invested().call(), 50);
        assert.equal(await dealClient.methods.state().call(), 0);
        purchasers = await dealClient.methods.getPurchasers().call();
        assert.equal(purchasers.length, 1);
      });

      // investor2 invests 50%
      await dealClient.methods.invest().send({
        from: investor2,
        value: 50,
        gasPrice: 8000000000,   // TODO
        gas: 4700000,           // TODO
      });
      it('should increment invested and change state to UPLOADING', async() => {
        assert.equal(await dealClient.methods.invested().call(), 100);
        assert.equal(await dealClient.methods.state().call(), 1);
        purchasers = await dealClient.methods.getPurchasers().call();
        assert.equal(purchasers.length, 2);
      });

      // Storage Provider uploaded data, and publishes deal
      await dealClient.methods.handle_filecoin_method(0, 2643134072, testmessageAuthParams).send({
        from: sp,
      });
      it('should change state to PURCHASABLE(enum=2)', async() => {
        state = await dealClient.methods.state().call();
        // check state change
        assert.equal(state, 2)
      });

      // Someone purchases dataset
      await dealClient.methods.purchase().send({
        from: purchaser,
        value: 100,
        gasPrice: 8000000000,   // TODO
        gas: 4700000,           // TODO
      });
      it('should add purchaser to purchasing list', async() => {
        purchasers = await dealClient.methods.getPurchasers().call();
        assert.equal(purchasers.length, 1);
      });
      it('should distribute purchased to investors', async() => {
        // check investor1 balance, increased by 100/2 = 50
        // check investor2 balance, increased by 100/2 = 50
      });

      // someone purchased, but didn't pay enough
      // Someone purchases dataset
      await dealClient.methods.purchase().send({
        from: purchaser2,
        value: 100,
        gasPrice: 8000000000,   // TODO
        gas: 4700000,           // TODO
      });
      it('purchase failed, should not add to purchaser list', async() => {
        purchasers = await dealClient.methods.getPurchasers().call();
        assert.equal(purchasers.length, 1);
      });
      it('purchase failed, no money is distributed to investors', async() => {
        // check investor1 balance, increased by 100/2 = 50
        // check investor2 balance, increased by 100/2 = 50
      });
  });

  it('Valid Case 2 --> excess invest, refund', async () => {
    // investor1 invests 50%
    await dealClient.methods.invest().send({
      from: investor1,
      value: 110,
      gasPrice: 1000000000, // TODO
      gas: 5000000, // TODO
    });
    // TODO: check investor is refunded 10 excess (total paid = 100 wei)
  });

  it('Valid Case 3 --> investors invested, but provider cancels contract', async () => {
    // investor1 invests 50%
    await dealClient.methods.invest().send({
      from: investor1,
      value: 50,
      gasPrice: 1000000000, // TODO
      gas: 5000000, // TODO
    });
    // investor2 invests 50%
    await dealClient.methods.invest().send({
      from: investor2,
      value: 40,
      gasPrice: 1000000000, // TODO
      gas: 5000000, // TODO
    });
    // contract is canceled
    await dealClient.methods.cancel().send({
      from: provider,
      gasPrice: 1000000000, // TODO
      gas: 5000000, // TODO
    });
    it('should change contract state', async() => {
      assert.equal(await dealClient.methods.state().call(), 4);
    });
    it('should refund money to investors', async() => {
        // check investor1 refunded 50
        // check investor2 refunded 50
    });
    // TODO: check investor is refunded 10 excess (total paid = 100 wei)
  });
  it('Authorization Error Case 1 --> non-provider tries to close contract', async () => {
    // contract is canceled
    await dealClient.methods.cancel().send({
      from: investor1,
      gasPrice: 1000000000, // TODO
      gas: 5000000, // TODO
    });
    it('should NOT change contract state', async() => {
      assert.equal(await dealClient.methods.state().call(), 0);
    });

    // contract is canceled
    await dealClient.methods.cancel().send({
      from: purchaser,
      gasPrice: 1000000000, // TODO
      gas: 5000000, // TODO
    });
    it('should NOT change contract state', async() => {
      assert.equal(await dealClient.methods.state().call(), 0);
    });
  });

  it('Authorization Error Case 2 --> investor and provider cannot purchase dataset', async () => {
    // investor1 invests 50%
    await dealClient.methods.invest().send({
      from: investor1,
      value: 100,
      gasPrice: 8000000000, // TODO
      gas: 4700000, // TODO
    });
    it('should increment invested, but state remains as INVESTING', async() => {
      assert.equal(await dealClient.methods.invested().call(), 50);
      assert.equal(await dealClient.methods.state().call(), 0);
      purchasers = await dealClient.methods.getPurchasers().call();
      assert.equal(purchasers.length, 1);
    });

    // Storage Provider uploaded data, and publishes deal
    await dealClient.methods.handle_filecoin_method(0, 2643134072, testmessageAuthParams).send({
      from: sp,
    });
    it('should change state to PURCHASABLE(enum=2)', async() => {
      state = await dealClient.methods.state().call();
      // check state change
      assert.equal(state, 2)
    });

    // investor purchases dataset
    var hasError;
    await dealClient.methods.purchase().send({
      from: investor1,
      value: 100,
      gasPrice: 8000000000,   // TODO
      gas: 4700000,           // TODO
    }).on('error', function(error, receipt) {
      hasError = true;
      console.log("Expected Err", error, receipt);
    });
    it('should expect error', async() => {
      assert.true(hasError);
    });

    // provider purchases dataset
    var hasError;
    await dealClient.methods.purchase().send({
      from: provider,
      value: 100,
      gasPrice: 8000000000,   // TODO
      gas: 4700000,           // TODO
    }).on('error', function(error, receipt) {
      hasError = true;
      console.log("Expected Err", error, receipt);
    });
    it('should expect error', async() => {
      assert.true(hasError);
    });
  });
});

// TODO: verify payment and account balances - gas fee
// var balance0 = await web3.eth.getBalance(investor1); //Will give value in.
// console.log("before send money - balance", balance0);
