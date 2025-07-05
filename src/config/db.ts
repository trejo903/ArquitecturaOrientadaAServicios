import {Sequelize} from 'sequelize-typescript'

export const db = new Sequelize("postgresql://neondb_owner:npg_MmLSPGNbC1U5@ep-silent-flower-aetngxfp-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",{
    models:[__dirname+"/../models/**/*"],
    logging:false,
    dialectOptions:{
        ssl:{
            require:false
        }
    }
})