/* import { configure, getLogger } from "log4js"; */
import ERC20 from "./wallets/erc20";
import Solar from "./wallets/solar";
import { encrypt, decrypt } from "./utils/crypto_functions";
import mongoose from "mongoose";
import sleep from "sleep-promise";
import Big from "big.js";
import fs from 'fs';
import {IConfig} from './types/types';
/* configure("./logs/swapper.log");
const logger = getLogger();
logger.level = "debug";

configure({
  appenders: { debug: { type: "file", filename: "cheese.log" } },
  categories: { default: { appenders: ["swapper"], level: "error" } },
});
 */
import swap from "./model/swap";
import SimpleLogger from './utils/logger';

// Models
const SwapModel = mongoose.model("Swap", swap);

let currentNonce: number = null;
let SolarWallet: Solar;
let ERC20Wallet: ERC20;
let BEP20Wallet: ERC20;

const logger = new SimpleLogger({
  directory:'logs',
  filename:'swapper',
  separate_errors:true,
  show_levels: ['info','warn','error','verbose','notice'], timestamp:true, colors:true
});

let lastSend = Date.now();

mongoose.connect("mongodb://127.0.0.1/swapper", function () {
  loadConfig();
  (async () => {
    currentNonce = await SolarWallet.getCurrentNonce();
    doRun();
  })();
});

function loadConfig() {
    try {
        logger.verbose(`Loading config file from config.json...`)
        let config : IConfig = JSON.parse(fs.readFileSync('./config.json').toString());
        SolarWallet = new Solar(config.solar);
        ERC20Wallet = new ERC20(config.eth);
        BEP20Wallet = new ERC20(config.bsc); 
        logger.notice("Config file was correctly loaded 🦾")
    } catch {
        logger.error("Config file was correctly loaded.")
    }
}

function doRun() {
    function _run() {
        (async () => {
          logger.info("Current Sending Nonce: " + currentNonce);

            if (Date.now() - lastSend > 900000)
              currentNonce = await SolarWallet.getCurrentNonce();
    
            await sleep(10);

            await checkNewTransactions();
            await swapConfirmedTransactions();
            await checkPendingTransactions();
        })();
      }
  setInterval(_run, 60000);
  _run();
}

async function _checkNewTransactions(blockchain: string) {
  let wallet: ERC20;
    let currentTimestamp = Date.now();
    if (blockchain == "eth") {
      wallet = ERC20Wallet;
    } else {
      wallet = BEP20Wallet;
    }
    logger.info(`Checking for swaps on ${blockchain.toUpperCase()} blockchain 🔍`)
    let txlist = await wallet.getRecentTransactions();
    logger.info(`Found ${txlist.length} transactions on ${blockchain.toUpperCase()} blockchain `)
    for (let i = 0; i < txlist.length; i++) {
      var thisTransaction = txlist[i];

      var existingRecord = await SwapModel.findOne({
        transactionId: thisTransaction.id,
      });

      if (existingRecord) {
        logger.verbose("Transaction is already in the database: " + thisTransaction.id);
      } else {
        let transaction: any;

        try {
          transaction = await wallet.getTransaction(thisTransaction.id);
        } catch (e) {
          logger.error("There was an error getting this transaction: "+thisTransaction.id);
          logger.error(e);
        }

        if (
          transaction &&
          transaction.details[0].contract == wallet.sxpswap.address &&
          transaction.details[0].tokenId == wallet.swipe_token.address
        ) {
          // It's correct contract and token, create swap record

          let swapToAddress = transaction.details[0].message;

          let validAddress;

          try {
            validAddress = await SolarWallet.validateAddress(swapToAddress);
          } catch (e) {
            validAddress = false;
          }

          let isError = false;
          let errorReason = "";

          if (validAddress == false) {
            isError = true;
            errorReason = "Invalid SXP Address";
          }

          let newSwap = {
            network: blockchain,
            senderAddress: transaction.details[0].fromaddress,
            tokenId: transaction.details[0].tokenId,
            transactionId: transaction.txid,
            quantity: transaction.details[0].amount,
            confirmations: transaction.confirmations,
            isConfirmed: transaction.confirmations > 35 ? true : false,
            isSwapped: false,
            isError: isError,
            errorReason: errorReason,
            swapAddress: swapToAddress,
            confirmedAt: transaction.confirmations > 35 ? currentTimestamp : 0,
            swappedAt: 0,
            swapTransactionId: ""
          };

          await SwapModel.create(newSwap);
        }
      }
    }
  }

async function checkNewTransactions() {
  await _checkNewTransactions("eth");
  await _checkNewTransactions("bsc");
}

async function checkPendingTransactions() {
      var currentTimestamp = Date.now();

      var pendingSwaps = await SwapModel.find({
        isConfirmed: false,
        isError: false,
      });
      logger.info(`Updating ${pendingSwaps.length} pending transactions...`)
      pendingSwaps.forEach(async (pendingSwap) => {
        try {
          let transaction: any;

          transaction =
            pendingSwap.network == "eth"
              ? await ERC20Wallet.getTransaction(pendingSwap.transactionId)
              : await BEP20Wallet.getTransaction(pendingSwap.transactionId);

          if (transaction.confirmations > 40) {
            await SwapModel.updateOne(
              { _id: pendingSwap._id },
              {
                confirmations: transaction.confirmations,
                isConfirmed: true,
                confirmedAt: currentTimestamp,
              }
            );
          }
        } catch (e) {
          logger.error(`Error trying to update this transaction: ${pendingSwap._id}`)
          logger.error(e);
        }
      });
    
}

async function swapConfirmedTransactions() {
      var pendingRecords = await SwapModel.find({
        isConfirmed: true,
        isError: false,
        isSwapped: false,
      }).limit(50);

      for (let i = 0; i < pendingRecords.length; i++) {
        let thisSwap = pendingRecords[i];

        // Check SXP Chain to ensure this swap hasn't already happened...

        let checkTimestamp = parseInt(String(thisSwap.confirmedAt).slice(0,-3));

        let checkTransactions =
          (await SolarWallet.getTransactionsBySenderRecipient(
            SolarWallet.masterAddress.address,
            thisSwap.swapAddress,
            checkTimestamp
          )) as Array<any>;

        let swapFound = false;

        for (let c = 0; c < checkTransactions.length; c++) {
          var checkTrx = checkTransactions[c];

          var swapVendorField = thisSwap.network + ":" + thisSwap.transactionId;

          if (checkTrx.vendorField == swapVendorField) {
            // Swap already completed...  Update db record.

            logger.error(`We've already swapped ${swapVendorField} according to this peer. Marked as completed ✅`)

            await SwapModel.updateOne(
              { _id: thisSwap._id },
              {
                isSwapped: true,
                swappedAt: checkTrx.timestamp * 1000,
                swapTransactionId: checkTrx.id,
              }
            );

            swapFound = true;
          }
        }

        if (swapFound == false) {
          logger.verbose(`Gonna send ${thisSwap.quantity} to ${thisSwap.swapAddress}`)
          // Check Swapper Balance
          var swapperBalance = 0;

          try {
            swapperBalance = (await SolarWallet.getBalance(
              SolarWallet.masterAddress.address
            )) as number;
          } catch (e) {}

          var balanceOk = false;

          try {
            if (Big(swapperBalance).gt(thisSwap.quantity)) {
              balanceOk = true;
            } else {
              logger.warn(`Swapper address doesn't have enough funds. Current balance: ${swapperBalance}`)
            }
          } catch (e) {
            logger.error("Error ocurred while checking swapper wallet balance.")
          }

          if (balanceOk == true) {
            // Lock Record
            await SwapModel.updateOne(
              { _id: thisSwap._id },
              { isSwapped: true }
            );

            try {
              var keys = SolarWallet.masterAddress;
              var toaddress = thisSwap.swapAddress;
              var amount = thisSwap.quantity;
              var paymentid = thisSwap.network + ":" + thisSwap.transactionId;

              currentNonce = parseInt(Big(currentNonce).plus(1).toFixed(0));
              logger.verbose(`Swapping ${amount} SXP coins on ${thisSwap.network} to ${toaddress}...`)

              var newTxId = await SolarWallet.sendTransaction(
                toaddress,
                paymentid,
                amount,
                keys,
                currentNonce
              );
              
              logger.notice(`Swapped ${amount} SXP to ${toaddress} 👌. Transaction hash is ${new String(newTxId).substr(0,10)}...`);

              await SwapModel.updateOne(
                { _id: thisSwap._id },
                {
                  isSwapped: true,
                  swappedAt: Date.now(),
                  swapTransactionId: newTxId,
                }
              );
              logger.verbose(`Database updated with transaction ${newTxId}`);

              lastSend = Date.now();

              await sleep(1);
            } catch (e) {
              logger.error(`There was an error while trying to swap the transaction ${thisSwap.transactionId} 🤦‍♂️`);
              logger.error(e);
              await SwapModel.updateOne(
                { _id: thisSwap._id },
                {
                  isSwapped: false,
                  isError: true,
                  errorReason: "Error While Sending",
                }
              );

              logger.warn("Refreshing nonce due to error while sending transaction...")

              break;
            }
          }
        }
      }
}
