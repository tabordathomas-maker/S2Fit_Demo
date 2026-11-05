// Tipos de las respuestas de la API (espejo de los esquemas Pydantic del backend).

export type Role = "customer" | "admin";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: Role;
  created_at: string;
}

export type PlusStatus = "active" | "expired" | "cancelled" | "pending_payment" | "none";

export interface AdminProfile extends Profile {
  plus_status: PlusStatus;
  plus_ends_at: string | null;
}

export interface AdminMembership {
  status: PlusStatus;
  plan_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Variant {
  id: number;
  sku: string;
  size: string;
  color: string;
  unit_price: number;
  available: number;
  is_active: boolean;
}

export interface ProductSummary {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_demo: boolean;
  category: Category;
  sizes: string[];
  colors: string[];
  in_stock: boolean;
}

export interface ProductDetail extends ProductSummary {
  variants: Variant[];
}

export type OrderStatus = "pending_payment" | "paid" | "cancelled" | "expired" | "refunded";
export type PaymentStatus = "pending" | "in_review" | "confirmed" | "rejected" | "refunded" | "cancelled";
export type PaymentMethod = "transfer" | "deposit" | "cash" | "other";

export interface OrderItem {
  variant_id: number;
  product_name: string;
  variant_label: string;
  sku: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  subtotal: number;
  total: number;
  reservation_status: "active" | "released" | "consumed";
  reservation_expires_at: string;
  customer_note: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  items: OrderItem[];
  payment: { status: PaymentStatus; amount: number | null; method: PaymentMethod | null; decided_at: string | null } | null;
}

export interface OrderWithMessage extends Order {
  whatsapp_message: string;
}

export interface Payment {
  id: string;
  kind: "order" | "subscription";
  status: PaymentStatus;
  amount: number | null;
  method: PaymentMethod | null;
  operation_reference: string;
  created_at: string;
  decided_at: string | null;
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  duration_days: number;
  period_label: string;
  benefits: string[];
  is_active: boolean;
  hide_price?: boolean;
  deleted_at?: string | null;
  usage?: { live: Record<string, number>; historical: Record<string, number> };
  in_use?: boolean;
}

export interface SubscriptionRequest {
  id: string;
  reference: string;
  kind: "new" | "renewal";
  status: "pending_payment" | "paid" | "rejected" | "cancelled";
  plan: Plan;
  agreed_price: number | null;
  agreed_duration_days: number | null;
  created_at: string;
}

export interface SubscriptionRequestCreated extends SubscriptionRequest {
  whatsapp_message: string;
  already_existed: boolean;
}

export interface Subscription {
  id: string;
  status: "pending_payment" | "active" | "expired" | "cancelled";
  plan: Plan;
  starts_at: string | null;
  ends_at: string | null;
  amount_paid: number | null;
  last_payment_reference: string | null;
  renewals: { period_start: string; period_end: string; duration_days: number; amount: number; created_at: string }[];
}

export interface MembershipStatus {
  is_active: boolean;
  subscription: Subscription | null;
  pending_request: SubscriptionRequest | null;
}

export type ContentKind = "routine" | "recipe" | "growth" | "meal";

export interface ContentItem {
  id: number;
  kind: ContentKind;
  title: string;
  summary: string | null;
  meta: string | null;
  meal_slot: string | null;
  cover_url: string | null;
  body: string | null;
  media_url: string | null;
}

export interface HabitDay {
  date: string;
  habits: { id: number; name: string; completed: boolean }[];
  completed: number;
  total: number;
  percent: number;
}

export interface HabitSummary {
  today: HabitDay;
  history: { date: string; completed: number; total: number; percent: number }[];
  weekly_percent: number;
}

export interface Challenge {
  id: number;
  title: string;
  description: string | null;
  target_count: number;
  joined: boolean;
  progress: number;
  completed: boolean;
  can_progress_today: boolean;
}

export interface ChallengesSummary {
  challenge_percent: number;
  challenges: Challenge[];
}

export interface Reward {
  id: number;
  kind: "habit_discount" | "challenge";
  name: string;
  description: string | null;
  threshold_pct: number;
  unlocked: boolean;
  redemption_status: "requested" | "fulfilled" | "cancelled" | null;
}

export interface RewardsSummary {
  habit_percent: number;
  challenge_percent: number;
  rewards: Reward[];
}
