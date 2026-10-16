-- Allow saving a tire before its size is known (unknown barcode in a scan / quick manual receive).
-- Such tires keep their qty in stock and appear under the "חסרי נתונים" filter on /tires
-- until the size is filled in. Harmless if the columns are already nullable.
ALTER TABLE tires ALTER COLUMN width   DROP NOT NULL;
ALTER TABLE tires ALTER COLUMN profile DROP NOT NULL;
ALTER TABLE tires ALTER COLUMN rim     DROP NOT NULL;
