# Hearth

Hearth is a local ledger for shared expenses. Create a group, add the people in it, and record who paid. Hearth shows each person's balance and the fewest payments that settle the group.

## Run

```bash
cd hearth
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Balances, expenses, and payments are stored in a SQLite file at `hearth/data/hearth.db`. Refreshing the page keeps them. Delete that file to start over.

```bash
npm test
```

## What you can do

- Create a group and add people
- Add an expense split equally, by percent, by shares, or by exact amounts
- Record more than one payer on the same expense
- See who owes whom in a group, simplified to the fewest payments
- See a person's overall balance across groups
- Record a settlement payment
- Browse an activity list of expenses and payments
- Pick a category for each expense

Amounts are in US dollars. Hearth is a single-user ledger on this computer: there are no accounts, receipt scans, or links to payment apps.
