---
source: zerodha
title: Kite Connect — Placing and Managing Orders
url: https://kite.trade/docs/connect/v3/orders/
---

# Placing and Managing Orders

## Placing an order

Place an order with `POST /orders/:variety`, where `:variety` is one of `regular`,
`amo`, `co` (cover order), `iceberg`, or `auction`. On success the API returns an
`order_id`. Order placement is asynchronous: a returned `order_id` means the order
was received by the system, not that it was executed. Always confirm final state via
the order book or postbacks.

## Required order parameters

The core parameters are: `tradingsymbol`, `exchange` (one of NSE, BSE, NFO, BFO,
CDS, BCD, MCX), `transaction_type` (`BUY` or `SELL`), `quantity`, `product`,
`order_type`, and `validity`. For `LIMIT` orders you must also send `price`; for
stop-loss orders you must send `trigger_price`.

## Modifying and cancelling

Modify a pending order with `PUT /orders/:variety/:order_id` and cancel it with
`DELETE /orders/:variety/:order_id`. You can only modify or cancel orders that are
still open (not fully executed, rejected, or already cancelled).

## Retrieving orders and trades

`GET /orders` returns the day's order book; `GET /orders/:order_id` returns the full
status history of a single order. `GET /trades` returns all executed trades for the
day. The `tag` field (up to 20 characters) lets you attach a custom label to an order
for later reconciliation.

## Order lifecycle states

An order moves through states such as `PUT ORDER REQ RECEIVED`, `VALIDATION PENDING`,
`OPEN`, `COMPLETE`, `CANCELLED`, and `REJECTED`. A `REJECTED` order includes a
`status_message` describing the reason (for example, insufficient funds or a price
outside the day's circuit limits).
