import { Context } from "../types"
import { LowSync } from 'lowdb'
import { JSONFileSync } from 'lowdb'
import lodash from 'lodash'

class LowWithLodash<T> extends LowSync<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data')
}

export interface ExternalWalletRiskScore {
    senderRiskScore: number,
    receiverRiskScore: number
}
type Data = {
    risks: any[]
}

export class RiskService {
    private db: any
    constructor() {
        //TODO change here the absolute path for the ./database.json file 
        const adapter = new JSONFileSync<Data>('/Users/ilyashusterman/Projects/balerrina/src/services/database.json')
        this.db = new LowWithLodash(adapter)
    }

    async getExternalWalletRiskScore(context: Context): Promise<ExternalWalletRiskScore> {
        return await this.loadRisks(context)
    }

    async loadRisks(context: Context) {
        await this.db.read();
        const risks = this.db.data.risks
        // can query 2 items  in single query, not sure about the syntax
        const senderRiskScore = this.db.chain
            .get('risks')
            .find({ address: context.sender.address })
            .value().risk
        const receiverRiskScore = this.db.chain
            .get('risks')
            .find({ address: context.receiver.address })
            .value().risk

        return {
            senderRiskScore: senderRiskScore,
            receiverRiskScore: receiverRiskScore,

        }
    }
    async save(context: Context) {
        await this.db.read();
        await this.db.get('risks')
            .nth(context.receiver.address)
            .assign({ risk: context.receiver.riskScore, blocked: context.sender.blocked })
            .value();
        await this.db.get('risks')
            .nth(context.sender.address)
            .assign({ risk: context.sender.riskScore, blocked: context.sender.blocked })
            .value();

        await this.db.write();
    }
}