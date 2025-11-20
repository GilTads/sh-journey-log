-- Add km_final column to trips table
ALTER TABLE public.trips ADD COLUMN km_final numeric;

-- Add columns for photo URLs
ALTER TABLE public.trips ADD COLUMN employee_photo_url text;
ALTER TABLE public.trips ADD COLUMN trip_photos_urls text[];

-- Create storage bucket for trip photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('trip-photos', 'trip-photos', true);

-- Create policies for trip photos bucket
CREATE POLICY "Anyone can upload trip photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'trip-photos');

CREATE POLICY "Anyone can view trip photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'trip-photos');

CREATE POLICY "Anyone can update trip photos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'trip-photos');