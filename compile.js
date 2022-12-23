const path = require('path');
const fs = require('fs');
const solc = require('solc');

const inboxPath = path.resolve(__dirname, 'contracts', 'DealClient.sol');
const source = fs.readFileSync(inboxPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'DealClient.sol': {
      content: source,
    },
    'CBORParse.sol': {
      content: fs.readFileSync(path.resolve(__dirname, 'contracts', 'CBORParse.sol'), 'utf8')
    },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['*'],
      },
    },
  },
};

console.log(JSON.parse(solc.compile(JSON.stringify(input))));
module.exports = JSON.parse(solc.compile(JSON.stringify(input))).contracts['DealClient.sol'];
