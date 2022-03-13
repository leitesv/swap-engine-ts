import { Transaction } from "@ethereumjs/tx";
const Common = require("@ethereumjs/common").default;
//const { Chain, Hardfork } = require('@ethereumjs/common');

import InputDataDecoder from "ethereum-input-data-decoder";

import Web3 from "web3";
import Big from "big.js";
import { BlockNumber } from "web3-core";
import SimpleLogger from "../utils/logger";
const logger = new SimpleLogger({
  directory:'logs',
  filename:'swapper',
  separate_errors:true,
  show_levels: ['info','warn','error','verbose','notice'], timestamp:true, colors:true
});
type IERC20Constructor = {
  swipe_token: { address: string; abi: [] };
  sxpswap: { address: string; abi: [] };
  provider_url: string;
};

export default class ERC20 {
  swipe_token: { address: string; abi: [] };
  sxpswap: { address: string; abi: [] };
  gasLimit: number;
  provider_url: string;
  web3: Web3;

  constructor(options: IERC20Constructor) {
    this.swipe_token = options.swipe_token;
    this.sxpswap = options.sxpswap;
    this.gasLimit = 135000;
    this.provider_url = options.provider_url;
    this.web3 = new Web3(options.provider_url);
  }

  reconnect() {
    this.web3 = new Web3(this.provider_url);
  }

  getNetworkInfo() {
    return new Promise<any>((resolve, reject) => {
      (async () => {
        try {
          let lastblock = await this.web3.eth.getBlockNumber();
          let blockinfo = await this.web3.eth.getBlock(lastblock);

          if (blockinfo) {
            let inforesponse = {
              version: "1",
              blockheight: blockinfo.number,
              lastblock: new Date((blockinfo.timestamp as number) * 1000),
            };
            resolve(inforesponse);
          } else {
            reject("NetInfo Lastblock Not Found");
          }
        } catch (e) {
          this.reconnect();
          reject(e);
        }
      })();
    });
  }

  getBlock(blockheight: BlockNumber) {
    return new Promise<any>((resolve, reject) => {
      (async () => {
        try {
          let blockinfo = await this.web3.eth.getBlock(blockheight);

          if (blockinfo) {
            let txlist = blockinfo.transactions;
            let inforesponse = {
              height: blockinfo.number,
              blockhash: blockinfo.hash,
              blocktime: new Date(
                (blockinfo.timestamp as number) * 1000
              ).toLocaleString("en-US"),
              transactions: txlist,
              raw: blockinfo,
            };
            resolve(inforesponse);
          } else {
            reject("BSC20: Block Not Found");
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getTransaction(transactionHash: string, withreceipt: boolean = true) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          let txinfo = await this.web3.eth.getTransaction(transactionHash);

          if (txinfo && txinfo.hash) {
            if (
              txinfo.to &&
              txinfo.to.toLowerCase() == this.sxpswap.address.toLowerCase() &&
              txinfo.input != "0x"
            ) {
              let tdetails = [];
              let fAmount = Big(txinfo.value).div(1e18).toFixed(8);
              let feeRaw = Big(txinfo.gas).times(txinfo.gasPrice);
              let feeDecimal = Big(feeRaw).div(1e18).toFixed(8);
              let ddetails = {
                amount: fAmount,
                fee: feeDecimal,
                type: "swapSXP",
                tokenId: "",
                message: "",
                contract: "",
                fromaddress: "",
              };

              tdetails.push(ddetails);

              let status = "pending";

              if (txinfo.blockNumber) status = "confirmed";

              let confirmations = 0;

              try {
                let networkInfo = await this.getNetworkInfo();
                let chainheight = networkInfo.blockheight;

                if (
                  chainheight &&
                  Big(chainheight).gt(0) &&
                  txinfo.blockNumber
                ) {
                  confirmations = parseInt(
                    Big(chainheight).minus(txinfo.blockNumber).toFixed(0)
                  );
                  if (Big(confirmations).lt(0)) confirmations = 0;
                }
              } catch (e) {
                confirmations = 0;
              }

              let blockdata = await this.getBlock(txinfo.blockNumber);

              let transinfo = {
                totalamount: fAmount,
                blockhash: txinfo.blockHash,
                blocknumber: txinfo.blockNumber,
                txid: txinfo.hash,
                id: txinfo.hash,
                fee: feeDecimal,
                status: status,
                confirmations: confirmations,
                timestamp: {
                  human: blockdata.blocktime,
                  unix: blockdata.raw.timestamp
                },
                details: tdetails,
                raw: txinfo,
              };
              let receiptdata = undefined;
              // Extra Stuff for ERC-20 Contracts
              if (withreceipt == true) {
                try {
                  receiptdata = await this.web3.eth.getTransactionReceipt(
                    transinfo.txid.toLowerCase()
                  );
                  if (!receiptdata || receiptdata.status == false) {
                    transinfo.confirmations = 0;
                  }
                } catch (e) {
                  reject(e);
                }
              } else {
                transinfo.confirmations = 0;
              }
              const decoder = new InputDataDecoder(
                this.sxpswap.abi
              );
              const result = decoder.decodeData(transinfo.raw.input);
              if (result.method == "swapSXP") {
                let weiamount = result.inputs[0].toString();
                let etheramount = this.web3.utils.fromWei(weiamount, "ether");
                let eamount = etheramount;
                let message = result.inputs[1].toString();
                let actualFeeRaw = Big(receiptdata.gasUsed).times(
                  txinfo.gasPrice
                );
                let actualFeeDecimal = Big(actualFeeRaw).div(1e18).toFixed(8);

                transinfo.totalamount = eamount;
                transinfo.details[0].amount = eamount;
                transinfo.fee = actualFeeDecimal;
                transinfo.details[0].fee = actualFeeDecimal;
                transinfo.details[0].tokenId = this.swipe_token.address;
                transinfo.details[0].contract = this.sxpswap.address;
                transinfo.details[0].message = message;
                transinfo.details[0].fromaddress = txinfo.from;

                resolve(transinfo);
              } else {
                reject("ERC20: Transaction Not Found");
              }
            } else {
              reject("ERC20: Transaction Not Found");
            }
          } else {
            reject("ERC20: Transaction Not Found");
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getBalance(address: string) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          let contract = new this.web3.eth.Contract(
            this.sxpswap.abi,
            this.sxpswap.address
          );
          let tokenbal = await contract.methods.balanceOf(address).call();
          let adjustexponent = "1e18";
          let balance = Big(tokenbal).div(adjustexponent).toFixed(18);
          resolve(balance);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getRecentTransactions(scanblocks = 2000) {
    return new Promise<Array<any>>((resolve, reject) => {
      (async () => {
        try {
          let starttime = Date.now();

          let currentBlockNumber = await this.web3.eth.getBlockNumber();
          currentBlockNumber -= 10;
          let fromBlock = currentBlockNumber - 2000;

          logger.info(`Getting transactions from block ${currentBlockNumber} to ${fromBlock}... 📦 `)

          let contract = new this.web3.eth.Contract(
            this.sxpswap.abi,
            this.sxpswap.address
          );

          let transferEvents = await contract.getPastEvents("Swap", {
            fromBlock: fromBlock,
            toBlock: currentBlockNumber,
            filter: {
              isError: 0,
              txreceipt_status: 1,
            }
          });
          
          let allEvents = transferEvents
            .sort((evOne, evTwo) => evOne.blockNumber - evTwo.blockNumber)
            .map(({ address, blockNumber, transactionHash, returnValues }) => {
              logger.verbose(`Found transaction ${transactionHash}`)
              return {
                id: transactionHash,
                fromaddress: returnValues._from,
                toaddress: returnValues._to,
                confirmations: currentBlockNumber - blockNumber,
                amount: Big(returnValues._amount)
                  .div(10 ** 18)
                  .toFixed(18),
              };
            });

          let endtime = Date.now();
          let elapsed = (endtime - starttime) / 1000;
          logger.info(`Found ${allEvents.length} transactions in ${elapsed} seconds`)
          resolve(allEvents);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }
}
