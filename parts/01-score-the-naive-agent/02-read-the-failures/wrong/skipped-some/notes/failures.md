# Why the naive agent failed

- sellers-in-sao-paulo: spelling. It found one way to write the city. It missed the other eight.
- distinct-customers: customer-id. It counted customer_id. There is one of those per order, not per person.
- repeat-customers-2017: customer-id. Each order has its own customer_id. So grouping by it never finds two orders for one person.
- repeat-customer-share: customer-id. The same cause. So the share comes out as 0.
- revenue-total: undefined-metric. It added item price and freight. The reference adds up the payments.
- gmv-2018: undefined-metric. It left the freight out of GMV.
- late-share-delivered: date-text. It compared the dates as text. The estimated date has no time of day.
- late-orders-2018: date-text. The same text compare. So an order that came on the estimated day counts as late.
