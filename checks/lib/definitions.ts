// The fair definitions of the two business numbers that have more than one right answer before metrics exist,
// and the fan-out totals that are wrong under any definition.
export const FAIR: Record<string, { name: string; sql: string }[]> = {
  "revenue-total": [
    { name: "payments received", sql: "SELECT ROUND(SUM(payment_value), 2) FROM order_payments" },
    {
      name: "item price plus freight",
      sql: "SELECT ROUND(SUM(price + freight_value), 2) FROM order_items",
    },
  ],
  "gmv-2018": [
    {
      name: "price plus freight",
      sql: "SELECT ROUND(SUM(i.price + i.freight_value), 2) FROM order_items i JOIN orders o ON o.order_id = i.order_id WHERE substr(o.order_purchase_timestamp, 1, 4) = '2018'",
    },
    {
      name: "price only",
      sql: "SELECT ROUND(SUM(i.price), 2) FROM order_items i JOIN orders o ON o.order_id = i.order_id WHERE substr(o.order_purchase_timestamp, 1, 4) = '2018'",
    },
  ],
};

export const FAN_OUT: Record<string, string> = {
  "revenue-total":
    "SELECT ROUND(SUM(p.payment_value), 2) FROM order_payments p JOIN order_items i ON i.order_id = p.order_id",
  "gmv-2018":
    "SELECT ROUND(SUM(i.price + i.freight_value), 2) FROM order_items i JOIN orders o ON o.order_id = i.order_id JOIN order_payments p ON p.order_id = o.order_id WHERE substr(o.order_purchase_timestamp, 1, 4) = '2018'",
};
