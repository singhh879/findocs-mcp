---
source: finvasia
title: Finvasia Shoonya API — Order Book, Trades, Positions
url: https://www.shoonya.com/api-documentation
---

# Finvasia Shoonya API — Order Book, Trades, and Positions

## Order book

`/OrderBook` returns the day's orders with their current status. Each entry includes
the `norenordno`, trading symbol, quantity, price, product, and a `status` field with
values such as `OPEN`, `COMPLETE`, `CANCELED`, `REJECTED`, and `TRIGGER_PENDING`.

## Trade book

`/TradeBook` returns the executed trades (fills) for the day, including the fill price
(`flprc`), filled quantity (`flqty`), and the corresponding order number.

## Positions and holdings

`/PositionBook` returns net intraday and carry-forward positions with realised and
unrealised profit and loss. `/Holdings` returns the demat holdings available for
delivery selling. Net P&L is computed from the average buy price against the last
traded price for open positions.

## Funds / limits

`/Limits` returns the account's available cash, margin used, and payin, used to check
buying power before placing orders.
