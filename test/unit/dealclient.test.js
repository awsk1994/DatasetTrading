const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(ganache.provider());
const toBN = web3.utils.toBN;

const { DealClient, MockMarket } = require('../../compile');
const DealClientAbi = DealClient.abi;
const DealClientEvm = DealClient.evm;
const MockMarketAbi = MockMarket.abi;
const MockMarketEvm = MockMarket.evm;

const testmessageAuthParams = '0x8240584c8bd82a5828000181e2039220206b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b190800f4420068420066656c6162656c0a1a0008ca0a42000a42000a42000a';

const weiPerGwei = 1000000000;
const gasPrice = 5 * weiPerGwei;
const gasLimit = 1000000;

let accounts;
let dealClient;

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

    dealClient = await new web3.eth.Contract(DealClientAbi)
        .deploy({
            data: DealClientEvm.bytecode.object,
            arguments: ['SOME_DESCRIPTION', 'SOME_EXAMPLE', 100, 100],
        })
        .send({
            from: provider,
            gasPrice: gasPrice,
            gas: 4700000,
        });
});

describe('DealClient', async () => {
  it('Check init values', async () => {
    assert.equal(await dealClient.methods.description().call(), 'SOME_DESCRIPTION');
    assert.equal(await dealClient.methods.example().call(), 'SOME_EXAMPLE');
    assert.equal(await dealClient.methods.initialInvestmentTarget().call(), 100);
    assert.equal(await dealClient.methods.purchasePrice().call(), 100);
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
        gasPrice: gasPrice,
        gas: gasLimit,
      });

      // Check::should increment invested, but state remains as INVESTING
      assert.equal(await dealClient.methods.invested().call(), 50);
      assert.equal(await dealClient.methods.state().call(), 0);
      // should add to investors list
      investors = await dealClient.methods.getInvestors().call();
      assert.equal(investors.length, 1);

      // investor2 invests 50%
      await dealClient.methods.invest().send({
        from: investor2,
        value: 50,
        gasPrice: gasPrice,
        gas: gasLimit,
      });
      // Check::should increment invested and change state to UPLOADING
      assert.equal(await dealClient.methods.invested().call(), 100);
      assert.equal(await dealClient.methods.state().call(), 1);
      // Check::should add to investors list
      investors = await dealClient.methods.getInvestors().call();
      assert.equal(investors.length, 2);

      // Storage Provider uploaded data, and publishes deal
      await dealClient.methods.handle_filecoin_method(0, 2643134072, testmessageAuthParams).send({
        from: sp,
      });
      // Check::should change state to PURCHASABLE(enum=2)
      state = await dealClient.methods.state().call();
      assert.equal(state, 2)

      // Someone purchases dataset
      prevInvestor1Bal = await web3.eth.getBalance(investor1);
      prevInvestor2Bal = await web3.eth.getBalance(investor2);
      await dealClient.methods.purchase().send({
        from: purchaser,
        value: 100,
        gasPrice: gasPrice,
        gas: gasLimit,
      });

      // Check::should add purchaser to purchasing list
      purchasers = await dealClient.methods.getPurchasers().call();
      assert.equal(purchasers.length, 1);

      // Check::should distribute purchased to investors
      investor1Bal = await web3.eth.getBalance(investor1);
      investor2Bal = await web3.eth.getBalance(investor2);        
      assert.equal(toBN(investor1Bal).sub(toBN(prevInvestor1Bal)).toString(), '50');
      assert.equal(toBN(investor2Bal).sub(toBN(prevInvestor2Bal)).toString(), '50');

      // Someone purchases dataset, but does not pay enough
      let err;
      try {
        await dealClient.methods.purchase().send({
          from: purchaser2,
          value: 50,
          gasPrice: gasPrice,
          gas: gasLimit,
        });
      } catch(e) {
        err = e;
      };

      // Check::error exist and reason is Money not enough
      assert.ok(typeof err != "undefined");
      keys = Object.keys(err['results'])
      assert.equal(err['results'][keys[0]]['reason'], 'Money sent does not equal purchasePrice');

      // Check::purchase failed, should not add to purchaser list
      purchasers = await dealClient.methods.getPurchasers().call();
      assert.equal(purchasers.length, 1);
  });

  it('Valid Case 2::when excess invest, refund', async () => {
    invested = await dealClient.methods.invested().call()
    // Check::no eth invested
    assert.equal(invested, 0);

    // investor1 invests over initialInvestmentTarget
    let prevBalance = toBN(await web3.eth.getBalance(investor1));
    let txInfo = await dealClient.methods.invest().send({
      from: investor1,
      value: 110,
      gasPrice: gasPrice,
      gas: gasLimit,
    });
    let afterBalance = toBN(await web3.eth.getBalance(investor1));

    // Check::Only deducted initialInvestmentValue from investor(excess is refunded)
    let totalGasInWei = toBN(txInfo.gasUsed).mul(toBN(gasPrice));
    let actualDeductedFromInvestorBalance = prevBalance.sub(afterBalance).sub(totalGasInWei).toString();
    assert(actualDeductedFromInvestorBalance, '100')
  });

  it('Valid Case 3::investors invested, but provider cancels contract', async () => {
    // investor1 invests 50%
    await dealClient.methods.invest().send({
      from: investor1,
      value: 50,
      gasPrice: gasPrice,
      gas: gasLimit,
    });
    // investor2 invests 50%
    await dealClient.methods.invest().send({
      from: investor2,
      value: 40,
      gasPrice: gasPrice,
      gas: gasLimit,
    });

    let prevBalance1 = toBN(await web3.eth.getBalance(investor1));
    let prevBalance2 = toBN(await web3.eth.getBalance(investor2));

    // contract is canceled
    await dealClient.methods.cancel().send({
      from: provider,
      gasPrice: gasPrice,
      gas: gasLimit,
    });

    // Check::should change contract state
    assert.equal(await dealClient.methods.state().call(), 4);
    // Check::should refund money to investors
    let nowBalance1 = toBN(await web3.eth.getBalance(investor1));
    let nowBalance2 = toBN(await web3.eth.getBalance(investor2));
    assert.equal(prevBalance1.sub(nowBalance1).toString(), '-50');
    assert.equal(prevBalance2.sub(nowBalance2).toString(), '-40');
  });

  it('Authorization Error Case 1::investor tries to close contract, but returns err', async () => {
    let err;
    try {
      await dealClient.methods.cancel().send({
        from: investor1,
        gasPrice: gasPrice,
        gas: gasLimit,
      });
    } catch(error) {
      err=error;
    };
    assert.ok(typeof err != "undefined");
  });

  it('Authorization Error Case 2::purchaser tries to close contract, but returns err', async () => {
    let err;
    try {
      await dealClient.methods.cancel().send({
        from: purchaser,
        gasPrice: gasPrice,
        gas: gasLimit,
      });
    } catch(error) {
      err=error;
    }
    assert.ok(typeof err != "undefined");
  });

  it('Authorization Error Case 3::investor and provider tries purchase dataset, but returns err', async () => {
    // investor1 invests 50%
    await dealClient.methods.invest().send({
      from: investor1,
      value: 100,
      gasPrice: gasPrice,
      gas: gasLimit,
    });
    // Storage Provider uploaded data, and publishes deal
    await dealClient.methods.handle_filecoin_method(0, 2643134072, testmessageAuthParams).send({
      from: sp,
    });

    // investor purchases dataset
    let err;
    try {
      await dealClient.methods.purchase().send({
        from: investor1,
        value: 100,
        gasPrice: gasPrice,
        gas: gasLimit,
      })
    } catch(error) {
      err=error;
    }
    // Check::err is not nil
    assert.ok(typeof err != "undefined");

    // provider purchases dataset
    err = undefined;
    assert.ok(typeof err == "undefined");
    try {
      await dealClient.methods.purchase().send({
        from: provider,
        value: 100,
        gasPrice: gasPrice,
        gas: gasLimit,
      })
    } catch(error) {
      err=error;
    }
    // Check::err is not nil
    assert.ok(typeof err != "undefined");
  });
});
