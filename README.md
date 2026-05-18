# xpen — backend

REST API for **Xpenz**, a personal finance tracker. Handles authentication and CRUD for incomes, expenses, and transfers, plus a monthly spending limit per user.

Frontend: [xpenz.vercel.app](https://xpenz.vercel.app)

## Stack

- Node.js + Express
- MongoDB via Mongoose
- JWT auth (httpOnly cookies)
- bcrypt for password hashing, Joi for request validation

## Layout

```
app.js          # express bootstrap, CORS, route mounting
db/             # mongoose connection
routes/         # auth, user, transactions
controllers/    # income, expense, transfer, limit
models/         # User, Income, Expense, Transfer
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/users` | Register |
| POST | `/api/auth` | Log in (sets cookie) |
| POST | `/api/auth/logout` | Clear cookie |
| POST/GET/DELETE | `/api/v1/{add,get,delete}-income` | Incomes |
| POST/GET/DELETE | `/api/v1/{add,get,delete}-expense` | Expenses |
| POST/GET/DELETE | `/api/v1/{add,get,delete}-transfer` | Transfers |
| GET/PUT | `/api/v1/get-limit`, `/update-limit` | Monthly spend limit |

## Running locally

```bash
npm install
npm start          # nodemon app.js
```

Required env vars:

```
PORT=
MONGO_URL=
JWTPRIVATEKEY=
SALT_ROUNDS=
```

## Docker

```bash
docker build -t xpen-backend .
docker run -p 8080:8080 --env-file .env xpen-backend
```
