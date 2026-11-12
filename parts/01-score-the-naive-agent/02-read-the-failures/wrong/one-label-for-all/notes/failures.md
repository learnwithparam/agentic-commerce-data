# Why the naive agent failed

- sellers-in-sao-paulo: spelling. It found one way to write the city. It missed the other eight.
- distinct-customers: spelling. It counted customer_id. There is one of those per order, not per person.
- repeat-customers-2017: spelling. Each order has its own customer_id. So grouping by it never finds two orders for one person.
- repeat-customer-share: spelling. The same cause. So the share comes out as 0.
- revenue-total: spelling. It added item price and freight. The reference adds up the payments.
- gmv-2018: spelling. It left the freight out of GMV.
- late-share-delivered: spelling. It compared the dates as text. The estimated date has no time of day.
- late-orders-2018: spelling. The same text compare. So an order that came on the estimated day counts as late.
- late-share-bed-bath-by-month: spelling. The join to order_items counts an order once for each item.
- late-sellers-sao-paulo-2018q2: spelling. It found one way to write the city. It also compared the dates as text.
- top-categories-gmv-2018: spelling. The names are in Portuguese. Also, its GMV has no freight.
- categories-without-translation: spelling. The left join also gives back the empty category.
- average-order-value-2017: spelling. The join from items to payments repeats each payment once for each item.
- payments-health-beauty-2018: spelling. Each payment is counted once for each beauty item.
- top-sellers-gmv-2018: spelling. Its GMV has no freight, so the totals change.
- customers-in-sao-paulo: spelling. It counted rows. Each row is an order, not a person.
