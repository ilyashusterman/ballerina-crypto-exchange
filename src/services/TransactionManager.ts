import { interpret } from 'xstate';
import { Wallet, Context } from '../types';
import { decisionMachine } from './decision';

export class TransactionManager {
    private lock = new Set<string>();

    async addTransaction(context: Context): Promise<any> {
        const { sender, receiver } = context;

        while (this.isLocked(sender, receiver)) {
            await this.sleep(100);
        }

        this.lockWallets(sender, receiver);
        return await this.processTransaction(context);
    }

    private isLocked(sender: Wallet, receiver: Wallet): boolean {
        return this.lock.has(sender.address) || this.lock.has(receiver.address);
    }

    private lockWallets(sender: Wallet, receiver: Wallet): void {
        this.lock.add(sender.address);
        this.lock.add(receiver.address);
    }

    private async processTransaction(context: Context): Promise<boolean> {
        return await new Promise((resolve, reject) => {
            const machineContext = decisionMachine.withContext(context);
            const machine = interpret(machineContext)
            // Perform the transaction
            machine.onTransition(async (state: any) => {
                const { value } = state;
                if (state.matches("approve")) {
                    resolve(true);
                    this.unlockWallets(context.sender, context.receiver);
                } else if (state.matches("reject")) {
                    reject(false)
                    this.unlockWallets(context.sender, context.receiver);
                }
            }
            );;
            machine.start()
            machine.send({ type: "NEW_TRANSACTION" });
        })


    }

    private unlockWallets(sender: Wallet, receiver: Wallet): void {
        this.lock.delete(sender.address);
        this.lock.delete(receiver.address);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
