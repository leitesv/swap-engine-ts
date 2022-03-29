import {
  Transactions as SolarTransactions,
  Managers as SolarManagers,
  Utils as SolarUtils,
  Identities as SolarIdentities,
  Identities,
} from "@solar-network/crypto";
import {Transactions} from '@arkecosystem/crypto';
import { BN } from "ethereumjs-util";
import Big from "big.js";
import { generateMnemonic } from "bip39";
import got from "got";
import { BigNumber } from "@arkecosystem/utils";
import { ITransaction, ITransactionData } from "@solar-network/crypto/dist/interfaces";
import SimpleLogger from "../utils/logger";

const logger = new SimpleLogger({
  directory:'logs',
  filename:'swapper',
  separate_errors:true,
  show_levels: ['info','warn','error','verbose','notice'], timestamp:true, colors:true
});

Big.RM = 0;
type ISolarConstructor = {
  providers: Array<string>;
  master: {
    address: string;
    paymentId: string;
    keyStore: string;
  };
};
export default class Solar {
  providers: string[];
  apiURL: string;
  apiURL2: string;
  apiURL3: string;
  masterAddress: { address: string; paymentId: string; keyStore: string };
  constructor(options: ISolarConstructor) {
    this.providers = options.providers;
    this.masterAddress = options.master;
    this.apiURL = options.providers[0];
    this.apiURL2 = options.providers[0];
    this.apiURL3 = options.providers[0];
  }

  getNetworkInfo() {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          let netinfo: any = await got(this.apiURL + "/blockchain").json();

          if (netinfo.data && netinfo.data.block) {
            let blockinfo: any = await got(
              this.apiURL + "/blocks?height=" + netinfo.data.block.height
            ).json();

            let lastblock = blockinfo.data[0].timestamp.human;

            let epochdiff =
              blockinfo.data[0].timestamp.unix -
              blockinfo.data[0].timestamp.epoch;

            // Base Response, you may add additional info
            let inforesponse = {
              version: "2.0",
              blockheight: netinfo.data.block.height,
              lastblock: lastblock,
              epochdiff: epochdiff,
            };

            resolve(inforesponse);
          } else {
            reject("Can not get Solar network info");
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getBlock(blockheight: string) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          SolarManagers.configManager.setHeight(0);

          let blockinfo: any = await got(
            this.apiURL + "/blocks?height=" + blockheight
          ).json();

          if (blockinfo.data && blockinfo.data[0]) {
            let txlist = [];

            if (blockinfo.data[0].transactions > 0) {
              let blocktxs: any = await got(
                this.apiURL +
                  "/blocks/" +
                  blockinfo.data[0].id +
                  "/transactions"
              ).json();

              for (let i = 0; i < blocktxs.data.length; i++) {
                txlist.push(blocktxs.data[i].id);
              }
            }

            // Base Response, you may add additional info
            let inforesponse = {
              height: blockinfo.data[0].height,
              blockhash: blockinfo.data[0].id,
              blocktime: blockinfo.data[0].timestamp.human,
              transactions: txlist,
              raw: blockinfo.data[0],
            };

            resolve(inforesponse);
          } else {
            reject("Block Not Found");
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getBlockById(blockid: string) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          //SolarManagers.configManager.setFromPreset("mainnet");
          SolarManagers.configManager.setHeight(0);

          let blockinfo: any = await got(
            this.apiURL + "/blocks/" + blockid
          ).json();

          if (blockinfo.data) {
            // Base Response, you may add additional info
            let inforesponse = {
              height: blockinfo.data.height,
              blockhash: blockinfo.data.id,
              blocktime: blockinfo.data.timestamp.human,
            };

            resolve(inforesponse);
          } else {
            reject("Block Not Found");
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getTransaction(transactionid: string) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          //SolarManagers.configManager.setFromPreset("mainnet");
          SolarManagers.configManager.setHeight(0);

          let txinfo: any = await got(
            this.apiURL + "/transactions/" + transactionid
          ).json();

          let excludedAddresses: any[] = []; // Exclude any sender addresses here

          if (
            txinfo.data &&
            excludedAddresses.indexOf(txinfo.data.sender) == -1
          ) {
            let blockinfo: any = await this.getBlockById(txinfo.data.blockId);

            if (txinfo.data.type == 0) {
              // Regular transfer 1 to 1
              let transinfo = {
                totalamount: Big(txinfo.data.amount)
                  .div(10 ** 8)
                  .toFixed(8),
                blockhash: txinfo.data.blockId,
                blocknumber: blockinfo.height,
                txid: txinfo.data.id,
                id: txinfo.data.id,
                fee: Big(txinfo.data.fee)
                  .div(10 ** 8)
                  .toFixed(8),
                status: txinfo.data.confirmations > 0 ? "confirmed" : "pending",
                confirmations: txinfo.data.confirmations,
                timestamp: {
                  human: txinfo.data.timestamp.human,
                  unix: txinfo.data.timestamp.unix,
                },
                details: [
                  {
                    amount: Big(txinfo.data.amount)
                      .div(10 ** 8)
                      .toFixed(8),
                    type: "transfer",
                    fromaddress: txinfo.data.sender,
                    toaddress: txinfo.data.recipient,
                    paymentid: "",
                  },
                ],
                raw: txinfo.data,
              };

              resolve(transinfo);
            } else if (txinfo.data.type == 6) {
              // Multi transfer
              let details = [];
              let totalamount = Big(0);
              for (let i = 0; i < txinfo.data.asset.payments.length; i++) {
                totalamount = Big(totalamount).plus(
                  txinfo.data.asset.payments[i].amount
                );

                let tdetails = {
                  amount: Big(txinfo.data.asset.payments[i].amount)
                    .div(10 ** 8)
                    .toFixed(8),
                  type: "transfer",
                  fromaddress: txinfo.data.sender,
                  toaddress: txinfo.data.asset.payments[i].recipientId,
                  paymentid: "",
                };

                details.push(tdetails);
              }

              let transinfo = {
                totalamount: Big(totalamount)
                  .div(10 ** 8)
                  .toFixed(8),
                blockhash: txinfo.data.blockId,
                blocknumber: blockinfo.height,
                txid: txinfo.data.id,
                id: txinfo.data.id,
                fee: Big(txinfo.data.fee)
                  .div(10 ** 8)
                  .toFixed(8),
                status: txinfo.data.confirmations > 0 ? "confirmed" : "pending",
                confirmations: txinfo.data.confirmations,
                timestamp: {
                  human: txinfo.data.timestamp.human,
                  unix: txinfo.data.timestamp.unix,
                },
                details: details,
                raw: txinfo.data,
              };

              resolve(transinfo);
            } else {
              resolve({});
            }
          } else {
            reject("Not Found");
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
          var balanceinfo: any = await got(
            this.apiURL + "/wallets/" + address
          ).json();

          if (balanceinfo.data && balanceinfo.data.balance) {
            let humanbalance = new Big(balanceinfo.data.balance)
              .div(10 ** 8)
              .toFixed(8);
            resolve(humanbalance);
          } else {
            resolve("0");
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getNewAddress() {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          //SolarManagers.configManager.setFromPreset("mainnet");
          SolarManagers.configManager.setHeight(0);

          var mnemonic = generateMnemonic();
          var recipientId = SolarIdentities.Address.fromPassphrase(mnemonic);
          var privkey = SolarIdentities.PrivateKey.fromPassphrase(mnemonic);
          var pubkey = SolarIdentities.PublicKey.fromPassphrase(mnemonic);

          var addressinfo = {
            address: recipientId,
            paymentId: "",
            keyStore: mnemonic,
          };

          resolve(addressinfo);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  validateAddress(address: string) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          SolarManagers.configManager.setFromPreset("mainnet");
          SolarManagers.configManager.setHeight(0);

          var validaddress = SolarIdentities.Address.validate(address);

          resolve(validaddress);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getFeeEstimate() {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          var feeInfo: any = await got(this.apiURL + "/node/fees").json();

          var averageFee = feeInfo.data[1]["transfer"]["avg"];

          var feeestimate = Big(averageFee)
            .div(10 ** 8)
            .toFixed(8);

          resolve(feeestimate);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  getCurrentNonce() {
    return new Promise<number>((resolve, reject) => {
      (async () => {
        try {
          var walletInfo: any = await got(
            this.apiURL + "/wallets/" + this.masterAddress.address
          ).json();

          var currentnonce = walletInfo.data.nonce;

          resolve(currentnonce);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  sendTransaction(
    toaddress: string,
    paymentid: string,
    amount: string,
    keys: any,
    nonceOverride: any = null
  ) {
    // keys are the return of getNewAddress
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          let walletInfo: any = await got(
            this.apiURL + "/wallets/" + keys.address
          ).json();

          let walletbalance = walletInfo.data.balance;

          let qamount = Big(amount)
            .times(10 ** 8)
            .toFixed(0);

          let feeEstimate = 0.05;

          try {
            feeEstimate = (await this.getFeeEstimate()) as number;
          } catch (e) {
            logger.warn("Couldn't get fee estimate. Using default 😥");
          }

          let qfeeEstimate = Big(feeEstimate)
            .times(10 ** 8)
            .toFixed(0);

          if (Big(qamount).plus(qfeeEstimate).gt(walletbalance)) {
            reject("Insufficient Funds!");
          }

          let validaddress = SolarIdentities.Address.validate(toaddress);

          if (validaddress === false) {
            reject("Invalid Recipient Address!");
          }
          let newnonce = "0";
          if (nonceOverride == null) {
            let currentnonce = walletInfo.data.nonce;

            if (currentnonce != null) {
              newnonce = Big(currentnonce).plus(1).toFixed(0);
            } else {
              newnonce = "1";
            }
          } else {
            newnonce = nonceOverride;
          }

          SolarManagers.configManager.setHeight(0);

          logger.verbose(`Nonce is ${newnonce}`);
          
          var itransaction = SolarTransactions.BuilderFactory.transfer()
          .version(2)
          .recipientId(toaddress)
          .fee(qfeeEstimate)
          .amount(qamount)
          .nonce(newnonce)
          .vendorField(paymentid)
          .sign(this.masterAddress.keyStore)//  mnemonic
          var transaction = itransaction.build().toJson();

          var sendTx: any = await got
            .post(this.apiURL + "/transactions", {
              body: JSON.stringify({ transactions: [transaction] }),
            })
            .json();
            
          var sendTx2: any = await got
            .post(this.apiURL2 + "/transactions", {
              body: JSON.stringify({ transactions: [transaction] }),
            })
            .json();
          var sendTx3: any = await got
            .post(this.apiURL3 + "/transactions", {
              body: JSON.stringify({ transactions: [transaction] }),
            })
            .json();

          if (sendTx.data && sendTx.data.accept.length > 0) {
            resolve(sendTx.data.accept[0]);
            logger.notice(`Transaction successfully sent 🙌`);
          } else if (sendTx2.data && sendTx2.data.accept.length > 0) {
            resolve(sendTx2.data.accept[0]);
            logger.notice(`Transaction successfully sent 🙌`);
          } else if (sendTx3.data && sendTx3.data.accept.length > 0) {
            resolve(sendTx3.data.accept[0]);
            logger.notice(`Transaction successfully sent 🙌`);
          } else {
            if (sendTx.data && sendTx.data.error) {
              reject(sendTx.data.error);
              logger.error("There was an error sending a transaction to the Solar blockchain.");
            } else {
              logger.error("There was an unknown error sending a transaction to the Solar blockchain.");
            }
          }
        } catch (e) {
          logger.error("There was an error during the transaction sending process.");
          logger.error(e);
          reject("Unknown Error");
        }
      })();
    });
  }

  getTransactionsBySenderRecipient(
    senderId: string,
    recipientId: string,
    fromTimestamp: number
  ) {
    return new Promise((resolve, reject) => {
      (async () => {
        var newtxlist = [];

        let txlist: any;
        try {
          logger.verbose("Checking "+this.apiURL +
            "/transactions?senderId=" +
            senderId +
            "&recipientId=" +
            recipientId +
            "&timestamp=" +
            fromTimestamp +
            "&page=1&limit=100&orderBy=timestamp%3Aasc for transactions.");
          txlist = await got(
            this.apiURL +
              "/transactions?senderId=" +
              senderId +
              "&recipientId=" +
              recipientId +
              "&timestamp=" +
              fromTimestamp +
              "&page=1&limit=100&orderBy=timestamp%3Aasc"
          ).json();
        } catch (e) {
          txlist = { data: [] };
          logger.error("Error getting transactions by recipient.");
        }

        for (let i = 0; i < txlist.data.length; i++) {
          let thisTx = txlist.data[i];

          let newtx = {
            id: thisTx.id,
            sender: thisTx.sender,
            recipient: thisTx.recipient,
            type: "transfer",
            amount: Big(thisTx.amount)
              .div(10 ** 8)
              .toFixed(8),
            confirmations: thisTx.confirmations,
            vendorField: thisTx.vendorField,
            timestamp: thisTx.timestamp.unix,
          };

          newtxlist.push(newtx);
        }

        resolve(newtxlist);
      })();
    });
  }

  getRecentTransactions(fromHeight = "", filter: any[] = []) {
    return new Promise((resolve, reject) => {
      (async () => {
        let newtxlist = [];
        let blocklist: any;
        try {
          blocklist = await got(
            this.apiURL +
              "/blocks?height.from=" +
              fromHeight +
              "page=1&limit=100"
          ).json();
        } catch (e) {
          blocklist = { data: [] };
          logger.error(e);
        }

        for (let i = 0; i < blocklist.data.length; i++) {
          let thisblock = blocklist.data[i];

          if (thisblock.transactions > 0) {
            let blocktxs: any;
            try {
              blocktxs = await got(
                this.apiURL + "/blocks/" + thisblock.id + "/transactions"
              ).json();
            } catch (e) {
              blocktxs = { data: [] };
              logger.error(e);
            }

            for (let j = 0; j < blocktxs.data.length; j++) {
              let txinfo = blocktxs.data[j];

              if (txinfo.type == 0) {
                if (filter.indexOf(txinfo.recipient) != -1) {
                  let newtx = {
                    id: txinfo.id,
                    address: txinfo.recipient,
                    type: "transfer",
                    amount: Big(txinfo.amount)
                      .div(10 ** 8)
                      .toFixed(8),
                    fee: 0,
                    confirmations: 0,
                    paymentid: "",
                  };

                  newtxlist.push(newtx);
                }
              } else if (txinfo.type == 6) {
                for (let k = 0; k < txinfo.asset.payments.length; k++) {
                  let thispayment = txinfo.asset.payments[k];

                  if (filter.indexOf(thispayment.recipientId) != -1) {
                    let newtx = {
                      id: txinfo.id,
                      address: thispayment.recipientId,
                      type: "transfer",
                      amount: Big(thispayment.amount)
                        .div(10 ** 8)
                        .toFixed(8),
                      fee: 0,
                      confirmations: 0,
                      paymentid: "",
                    };

                    newtxlist.push(newtx);
                  }
                }
              }
            }
          }
        }

        resolve(newtxlist);
      })();
    });
  }
}

module.exports = Solar;
