---
source: finvasia
title: Finvasia Shoonya API — Order Placement
url: https://www.shoonya.com/api-documentation
---

# Finvasia Shoonya API — Order Placement

Place an order with the `/PlaceOrder` endpoint. Orders are confirmed asynchronously;
a successful response returns a `norenordno` (the Noren order number) which you use to
track, modify, or cancel the order.

## Buy/sell and quantity

The `trantype` field is `B` for buy or `S` for sell. `qty` is the order quantity and
`tsym` is the trading symbol (URL-encoded). The `exch` field is the exchange, such as
`NSE`, `BSE`, `NFO`, `CDS`, or `MCX`.

## Product types

The `prd` (product) field selects the product. `C` is CNC / delivery (cash and carry),
`M` is NRML / normal margin for carry-forward F&O, `I` is MIS / intraday, `H` is a
cover order (high-leverage with stop-loss), and `B` is a bracket order.

## Price types

The `prctyp` (price type) field selects the order type. `MKT` is a market order, `LMT`
is a limit order (requires `prc`), `SL-LMT` is a stop-loss limit order (requires `prc`
and `trgprc`), and `SL-MKT` is a stop-loss market order (requires `trgprc`).

## Modify and cancel

Use `/ModifyOrder` with the `norenordno` to change price, quantity, or order type of a
pending order, and `/CancelOrder` with the `norenordno` to cancel it. Only open orders
can be modified or cancelled.
