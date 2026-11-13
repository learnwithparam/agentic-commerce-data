# Why the naive agent failed

- sellers-in-sao-paulo: spelling. It found one way to write the city. It missed the other eight.
- distinct-customers: customer-id. It counted customer_id. There is one of those per order, not per person.
- repeat-customers-2017: customer-id. Each order has its own customer_id. So grouping by it never finds two orders for one person.
- repeat-customer-share: customer-id. The same cause. So the share comes out as 0.
- revenue-total: undefined-metric. It added item price and freight. The reference adds up the payments.
- gmv-2018: undefined-metric. It left the freight out of GMV.
- late-share-delivered: date-text. It compared the dates as text. The estimated date has no time of day.
- late-orders-2018: date-text. The same text compare. So an order that came on the estimated day counts as late.
- late-share-bed-bath-by-month: fan-out. The join to order_items counts an order once for each item.
- late-sellers-sao-paulo-2018q2: spelling. It found one way to write the city. It also compared the dates as text.
- top-categories-gmv-2018: translation. The names are in Portuguese. Also, its GMV has no freight.
- categories-without-translation: translation. The left join also gives back the empty category.
- average-order-value-2017: fan-out. The join from items to payments repeats each payment once for each item.
- payments-health-beauty-2018: fan-out. Each payment is counted once for each beauty item.
- top-sellers-gmv-2018: undefined-metric. Its GMV has no freight, so the totals change.
- customers-in-sao-paulo: customer-id. It counted rows. Each row is an order, not a person.
- orders-total: status-filter. It counted canceled orders too.
