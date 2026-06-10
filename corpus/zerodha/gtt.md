---
source: zerodha
title: Kite Connect — GTT (Good Till Triggered) Orders
url: https://kite.trade/docs/connect/v3/gtt/
---

# GTT — Good Till Triggered Orders

A GTT lets you set a trigger condition that stays active for a long period; when the
condition is met, Kite places the associated order. GTTs are managed on Zerodha's
servers, so they remain active even when your app or terminal is offline.

## Trigger types

There are two trigger types. A `single` GTT fires one order when the last traded
price crosses a single trigger value. A `two-leg` (OCO — One Cancels Other) GTT has
both a stop-loss leg and a target leg; when either leg triggers, the other is
automatically cancelled.

## Validity

A GTT is valid for up to 365 days from the date of creation. After expiry it is
removed automatically without placing an order.

## Endpoints

Create a GTT with `POST /gtt/triggers`, list all GTTs with `GET /gtt/triggers`, fetch
one with `GET /gtt/triggers/:id`, modify with `PUT /gtt/triggers/:id`, and delete with
`DELETE /gtt/triggers/:id`. Each GTT carries a `condition` (instrument, exchange,
trigger values, and last price) and a list of `orders` to place when triggered.

## Important notes

A GTT is a request to place an order at trigger time, not a guarantee of execution —
the order is subject to the usual margin, circuit-limit, and liquidity checks when it
fires. GTTs are not supported for all segments; they are primarily for equity and F&O.
