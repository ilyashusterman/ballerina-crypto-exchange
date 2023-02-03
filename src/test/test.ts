import { interpret } from "xstate";
import { decisionMachine } from "../services/decision";
import { Context, Transcation, Wallet } from "../types";
import { TransactionManager } from "../services/TransactionManager";

const getMockService = () => {
    const sender: Wallet = {
        isExternal: false,
        blocked: false,
        address: "user-1",
    };

    const receiver: Wallet = {
        isExternal: true,
        blocked: false,
        address: "user-2",
    };

    const transcation: Transcation = {
        sender: sender.address,
        receiver: receiver.address,
        amount: 10,
    };

    const ctx: Context = {
        sender,
        receiver,
        transcation,
    };

    const machineContext = decisionMachine.withContext(ctx);
    const machine = interpret(machineContext)

    return { machine, ctx };
}


describe("Decision Service", () => {
    const { machine, ctx } = getMockService();

    test("Logic test: Decision engine logic should work fine", (done: any) => {
        machine.onTransition(async (state: any) => {
            const { value } = state;
            if (state.matches("approve")) {
                await done();
            }
        }
        );;
        machine.start()
        machine.send({ type: "NEW_TRANSACTION" });
    });

    test("Parrallel test: Transaction manager should solve synchronization problem", async () => {
        const result = await new TransactionManager().addTransaction(ctx)
        expect(result).toBe(true);
    });
});

