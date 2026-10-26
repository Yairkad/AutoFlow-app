-- Coupon layout on the public home page: the big benefit on the coupon stub
-- ("10%", "מתנה") and a short line under it ("הנחה", "איזון גלגלים").
alter table promotions add column if not exists benefit     text;
alter table promotions add column if not exists benefit_sub text;
