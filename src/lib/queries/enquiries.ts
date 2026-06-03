import { createClient } from '@/lib/supabase/server';
import { dbToEnquiry } from '@/lib/mappers/enquiry';
import type { Enquiry, EnquiryActivity } from '@/lib/types/enquiry';

export async function getEnquiries(): Promise<Enquiry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []).map(dbToEnquiry);
}

export async function getEnquiryActivities(enquiryId: string): Promise<EnquiryActivity[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('enquiry_activities')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row['id'] as string,
    enquiryId: row['enquiry_id'] as string,
    type: row['type'] as EnquiryActivity['type'],
    note: row['note'] as string,
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as string,
  }));
}
