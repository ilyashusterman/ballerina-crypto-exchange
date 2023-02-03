import { assign, createMachine, send } from "xstate";
import { RiskService } from "./RiskService";
import { Context } from "../types";
import {
    INTERNAL_RISK_LIMIT,
    INTERNAL_TO_INTERNAL_RISK_LIMIT,
    BLOCK_LIMIT, REJECTION_PENALTY,
    INTERNAL_TO_INTERNAL_REJECTION_PENALTY
} from "../config";


const oneIsBlocked = (context: Context) => {
    return context.receiver.blocked || context.receiver.blocked
};

export const decisionMachine = createMachine<Context>({
    id: "CRYPTO_TRANSACTION",
    initial: "idle",
    states: {
        idle: {
            on: {
                NEW_TRANSACTION: [
                    {
                        cond: (ctx: Context) => {
                            return ctx.sender.isExternal || ctx.receiver.isExternal
                        },
                        target: "getExternalWalletRiskScore",
                    },
                    {
                        cond: (ctx: Context) => ctx.receiver.blocked!,
                        target: "blockSender",
                    },
                    {
                        target: "updateRiskScores"
                    },
                ],
            },
        },
        blockSender: {
            invoke: {
                src: assign((ctx: Context, event) => {
                    ctx.sender.blocked = true
                    return ctx
                }),
                onDone: {
                    actions: send(() => ({ type: "BLOCK_SENDER_COMPLETE" }))
                },
                onError: 'reject'
            },
            on: {
                BLOCK_SENDER_COMPLETE: {
                    target: "reject",
                },
            },
        },
        getExternalWalletRiskScore: {
            invoke: {
                src: async (context, event) => await new RiskService().getExternalWalletRiskScore(context),
                onDone: {
                    actions: [
                        assign((ctx: Context, event) => {
                            const score = event.data
                            ctx.receiver.riskScore = score.receiverRiskScore
                            ctx.sender.riskScore = score.senderRiskScore
                            const totalRisk = score.senderRiskScore! + score.receiverRiskScore!
                            return { ...ctx, newExternalRiskScore: totalRisk }
                        }),
                        send(() => ({ type: 'EXTERNAL_RISK_CAPTURED' }))
                    ]
                },
                onError: 'reject'
            },
            on: {
                EXTERNAL_RISK_CAPTURED: {
                    target: "updateRiskScores",
                    actions: [
                        assign((ctx: Context) => {
                            if (!ctx.sender.isExternal && ctx.receiver.isExternal) {
                                ctx.sender.riskScore = ctx.totalRisk
                            }
                            else if (!ctx.receiver.isExternal && ctx.sender.isExternal) {
                                ctx.receiver.riskScore = ctx.totalRisk
                            }
                            if (ctx.totalRisk! >= INTERNAL_RISK_LIMIT) {
                                ctx.transcation!.rejected! = true
                                ctx.transcation!.rejectionReason! = "Internal risk limit exceeded"
                            }
                            return ctx;
                        }), send(() => ({ type: "UPDATE_COMPLETE" }))
                    ],
                },
            },
        },
        updateRiskScores: {
            invoke: {
                src: async (context, event) => await new RiskService().loadRisks(context),
                onDone: {
                    actions: [
                        assign((ctx: Context, event) => {
                            const score = event.data
                            ctx.receiver.riskScore = score.receiverRiskScore
                            ctx.sender.riskScore = score.senderRiskScore
                            return ctx
                        })
                    ]
                },
                onError: 'reject'
            },
            on: {
                UPDATE_COMPLETE: {
                    target: "checkTransactionApproval",
                    actions: [
                        assign((context: Context) => {
                            let rejected = false;
                            let approved = true;

                            if (context.transcation?.rejected) {
                                rejected = true
                                approved = false
                            }
                            if ((context.sender.riskScore! + context.receiver.riskScore!) >= INTERNAL_TO_INTERNAL_RISK_LIMIT || oneIsBlocked(context)) {
                                context.transcation!.rejectionReason = " sum of the risk scores for the two wallets is above 300 or if one of the wallets is marked as blocked."
                                rejected = true
                                approved = false
                            }
                            context.transcation!.rejected = rejected
                            context.transcation!.approved = approved
                            return context;
                        }),
                        send((ctx: Context, event: any) => {
                            const type = ctx.transcation!.rejected ? "REJECT_TRANSACTION" : "APPROVE_TRANSACTION"
                            return { type: type }
                        })
                    ]
                },
            },
        },
        checkTransactionApproval: {
            on: {
                APPROVE_TRANSACTION: {
                    target: "approve",
                },
                REJECT_TRANSACTION: [
                    {
                        target: "reject",
                    },
                    {
                        cond: (ctx: Context) => ctx.sender.riskScore! >= BLOCK_LIMIT || ctx.receiver.riskScore! >= BLOCK_LIMIT,
                        target: "blockWallet",
                    },
                ],
            },
        },
        reject: {
            type: "final",
            invoke: {
                src: assign((ctx: Context, event) => {
                    // one of External
                    if (ctx.sender.isExternal && !ctx.receiver.isExternal) {
                        ctx.receiver.riskScore = ctx.receiver.riskScore! + ctx.receiver.riskScore! * REJECTION_PENALTY
                    }
                    else if (ctx.receiver.isExternal && !ctx.sender.isExternal) {
                        ctx.sender.riskScore = ctx.sender.riskScore! + ctx.sender.riskScore! * REJECTION_PENALTY
                    }
                    // two internals 
                    else if (!ctx.sender.isExternal && !ctx.receiver.isExternal) {
                        ctx.sender.riskScore = ctx.sender.riskScore! * INTERNAL_TO_INTERNAL_REJECTION_PENALTY + ctx.sender.riskScore!
                        ctx.receiver.riskScore = ctx.receiver.riskScore! * INTERNAL_TO_INTERNAL_REJECTION_PENALTY + ctx.receiver.riskScore!
                    }
                    return ctx
                }),
                onDone: {
                    actions: [
                        async (context: Context) => {
                            await new RiskService().save(context)
                        }
                    ]
                }
            }
        },
        approve: {
            type: "final",
            invoke: {
                src: async (context: Context) => {
                    await new RiskService().save(context)
                }
            }
        },
        blockWallet: {
            invoke: {
                src: assign((context: Context, event) => ({
                    ...context, sender: {
                        ...context.sender,
                        blocked: true
                    }
                })),
                onDone: {
                    actions: send(() => ({ type: "ALERT_SENT" }))
                }
            },
            on: {
                ALERT_SENT: {
                    target: "reject",
                },
            },
        },
    },
}
);