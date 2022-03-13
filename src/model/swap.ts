import mongoose from "mongoose";

export const swap: mongoose.Schema = new mongoose.Schema(
  {
    network: String,
    senderAddress: String,
    tokenId: String,
    transactionId: String,
    transactionTimestamp: Number,
    quantity: String,
    confirmations: Number,
    isConfirmed: Boolean,
    isSwapped: Boolean,
    isError: Boolean,
    errorReason: String,
    swapAddress: String,
    confirmedAt: Number,
    swappedAt: Number,
    swapTransactionId: String,
  },
  {
    timestamps: { currentTime: () => Math.floor(Date.now()) },
    collection: "swap",
  }
)
  .index({ isConfirmed: 1 }, { background: true })
  .index({ isSwapped: 1 }, { background: true })
  .index({ isError: 1 }, { background: true })
  .index({ senderAddress: 1 }, { background: true })
  .index({ transactionId: 1 }, { background: true })
  .index({ swapAddress: 1 }, { background: true })
  .index({ swapTransactionId: 1 }, { background: true });

export default swap;
