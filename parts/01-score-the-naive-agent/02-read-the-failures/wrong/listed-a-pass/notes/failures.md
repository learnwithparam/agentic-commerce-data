# Why the naive agent failed

- sellers-in-sao-paulo: spelling. It found one way to write the city. It missed the other eight.
- distinct-customers: customer-id. It counted the customer_id. That is one per order, not one per person.
- repeat-customers-2017: customer-id. Each order has its own customer_id. A group by it never holds two orders for one person.
- repeat-customer-share: customer-id. The same cause. So the share comes out as 0.
- revenue-total: undefined-metric. It added up the price and the freight. The reference adds the payments.
- gmv-2018: undefined-metric. It left out all of the freight.
- late-share-delivered: date-text. It read the dates as text. The due date has no time of day.
- late-orders-2018: date-text. The same text compare. So an order that came on the due day counts as late.
- late-share-bed-bath-by-month: fan-out. The join counts an order once per item.
- late-sellers-sao-paulo-2018q2: spelling. It found one way to write the city. It also read the dates as text.
- top-categories-gmv-2018: translation. The names are in Portuguese. Its GMV has no freight.
- categories-without-translation: translation. The left join gives back the empty category.
- average-order-value-2017: fan-out. The join repeats each payment. It does so once per item.
- payments-health-beauty-2018: fan-out. Each payment is counted once per beauty item.
- top-sellers-gmv-2018: undefined-metric. Its GMV has no freight. So the totals change.
- customers-in-sao-paulo: customer-id. It counted the rows. Each row is one order. It is not one person.
- orders-total: status-filter. It counted the canceled orders as well.
