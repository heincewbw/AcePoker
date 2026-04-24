import mongoose, { Document, Schema } from 'mongoose';

export type TransactionType = 'deposit' | 'withdrawal' | 'win' | 'loss' | 'refund';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled';

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: number;
  currency: 'USDT' | 'CHIPS';
  txHash?: string;
  network?: string;
  walletAddress?: string;
  status: TransactionStatus;
  description?: string;
  confirmations?: number;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'win', 'loss', 'refund'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ['USDT', 'CHIPS'],
      required: true,
    },
    txHash: { type: String, default: null },
    network: { type: String, default: 'BSC' },
    walletAddress: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'cancelled'],
      default: 'pending',
    },
    description: { type: String, default: null },
    confirmations: { type: Number, default: 0 },
  },
  { timestamps: true }
);

transactionSchema.index({ txHash: 1 }, { unique: true, sparse: true });
transactionSchema.index({ userId: 1, createdAt: -1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
