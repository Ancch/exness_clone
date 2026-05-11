import express, {  Response, Router } from "express";
import { auth, AuthenticatedRequest } from "src/middleware";
import { query } from '@repo/db';
import { AccountTypeConfig } from "@repo/types/account";
import { v4 as uuid } from 'uuid';


const accountRouter: Router = express.Router(); 

accountRouter.post('/accounts', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      type = 'demo',
      accountType = 'standard',
      leverage: inputLeverage,
    } = req.body;

    if (!['demo', 'real'].includes(type)) {
      return res.status(400).json({ error: 'type must be demo or real' });
    }
    const validTypes = ['standard', 'raw', 'zero'];
    const finalAccountType = validTypes.includes(accountType) ? accountType : 'standard';

    const config = AccountTypeConfig[finalAccountType as keyof typeof AccountTypeConfig]
                   || AccountTypeConfig.standard;
    const finalLeverage = inputLeverage || config.leverage;

    const initialBalance = type === 'demo' ? 100000 : 0;
    const accountId = uuid();

    await query(
      `INSERT INTO accounts
       (id, user_id, type, balance, equity, free_margin, used_margin,
        account_type, leverage, risk_score, commission_rate, pnl)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [accountId, req.userId, type, initialBalance, initialBalance,
       initialBalance, 0, finalAccountType, finalLeverage, 50,
       config.commissionRate, 0]
    );

    const newAccount = await query(`SELECT * FROM accounts WHERE id = $1`, [accountId]);
    res.status(201).json(newAccount[0]);
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


accountRouter.get('/accounts', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accounts = await query(
      `SELECT id, user_id, type, balance, equity, free_margin, used_margin,
              account_type, leverage, risk_score, commission_rate, pnl, created_at
       FROM accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(accounts);
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default accountRouter;