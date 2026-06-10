---
source: zerodha
title: Kite Connect — Margins, Funds, and Charges
url: https://kite.trade/docs/connect/v3/margins/
---

# Margins, Funds, and Charges

## User margins

`GET /user/margins` returns the available margin for the user, split into two
segments: `equity` and `commodity`. Each segment reports `net` available cash plus a
breakdown of utilised and available balances, collateral, and span/exposure.

## Order margins

`POST /margins/orders` computes the margin required for a basket of orders before you
place them. Send an array of proposed orders and the API returns the total span,
exposure, option premium, and additional margins for the basket. This lets you check
affordability up front.

## Basket margins

`POST /margins/basket` is designed for multi-leg F&O strategies. It accounts for
margin benefits from hedged positions, so the reported requirement reflects the netted
margin of the basket rather than the sum of each leg in isolation.

## Charges / order contract note

`POST /charges/orders` estimates the charges for a set of orders — brokerage, STT/CTT,
exchange transaction charges, GST, SEBI charges, and stamp duty — mirroring what would
appear on the contract note.
