-- Expand private_dataset_captures bucket allowlist (Phase 4I-B)
-- Run in Supabase SQL Editor after the base table exists.

begin;

alter table public.private_dataset_captures
  drop constraint if exists private_dataset_captures_selected_bucket_allowed;

alter table public.private_dataset_captures
  drop constraint if exists private_dataset_captures_suggested_bucket_allowed;

alter table public.private_dataset_captures
  drop constraint if exists private_dataset_captures_human_verified_label_allowed;

alter table public.private_dataset_captures
  add constraint private_dataset_captures_selected_bucket_allowed check (
    selected_bucket in (
      'real_pet_photos',
      'phone_screen_photos',
      'indoor_soft_light',
      'screenshots',
      'ai_controls',
      'real_people_photos',
      'real_document_photos',
      'real_food_photos',
      'real_vehicle_photos',
      'real_nature_sky',
      'real_low_light',
      'real_reflections_glass',
      'photo_of_photo',
      'social_media_screenshots',
      'edited_real',
      'ai_generated_people',
      'ai_generated_objects',
      'ai_generated_art',
      'ai_generated_screenshot_like',
      'uncertain_mixed'
    )
  );

alter table public.private_dataset_captures
  add constraint private_dataset_captures_suggested_bucket_allowed check (
    suggested_bucket is null
    or suggested_bucket in (
      'real_pet_photos',
      'phone_screen_photos',
      'indoor_soft_light',
      'screenshots',
      'ai_controls',
      'real_people_photos',
      'real_document_photos',
      'real_food_photos',
      'real_vehicle_photos',
      'real_nature_sky',
      'real_low_light',
      'real_reflections_glass',
      'photo_of_photo',
      'social_media_screenshots',
      'edited_real',
      'ai_generated_people',
      'ai_generated_objects',
      'ai_generated_art',
      'ai_generated_screenshot_like',
      'uncertain_mixed'
    )
  );

alter table public.private_dataset_captures
  add constraint private_dataset_captures_human_verified_label_allowed check (
    human_verified_label in (
      'real_pet_photos',
      'phone_screen_photos',
      'indoor_soft_light',
      'screenshots',
      'ai_controls',
      'real_people_photos',
      'real_document_photos',
      'real_food_photos',
      'real_vehicle_photos',
      'real_nature_sky',
      'real_low_light',
      'real_reflections_glass',
      'photo_of_photo',
      'social_media_screenshots',
      'edited_real',
      'ai_generated_people',
      'ai_generated_objects',
      'ai_generated_art',
      'ai_generated_screenshot_like',
      'uncertain_mixed'
    )
  );

commit;
