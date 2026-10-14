export type SplitMode = "equal" | "percent" | "shares" | "exact";

export type PersonRef = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  tint: string;
};

export type ParticipantInput = {
  personId: string;
  weight: number;
};

export type PayerInput = {
  personId: string;
  amountCents: number;
};

export type ExpenseInput = {
  groupId: string;
  description: string;
  amountCents: number;
  categoryId: string;
  occurredOn: string;
  splitMode: SplitMode;
  payers: PayerInput[];
  participants: ParticipantInput[];
};

export type SettlementInput = {
  groupId: string;
  fromPersonId: string;
  toPersonId: string;
  amountCents: number;
  occurredOn: string;
  note: string;
};

export type ShareRow = {
  personId: string;
  name: string;
  amountCents: number;
};

export type ActivityItem = {
  kind: "expense" | "settlement";
  id: string;
  groupId: string;
  groupName: string;
  occurredOn: string;
  createdAt: string;
  description: string;
  amountCents: number;
  categoryName?: string;
  categoryTint?: string;
  splitMode?: SplitMode;
  payers?: ShareRow[];
  shares?: ShareRow[];
  fromId?: string;
  fromName?: string;
  toId?: string;
  toName?: string;
  note?: string | null;
};

export type BalanceRow = PersonRef & {
  cents: number;
};

export type TransferRow = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  cents: number;
};

export type GroupView = {
  group: { id: string; name: string; createdAt: string };
  meId: string | null;
  categories: Category[];
  members: PersonRef[];
  otherPeople: PersonRef[];
  balances: BalanceRow[];
  transfers: TransferRow[];
  activity: ActivityItem[];
  yourCents: number | null;
};

export type GroupSummary = {
  id: string;
  name: string;
  memberCount: number;
  yourCents: number | null;
  latestAt: string;
};

export type PersonSummary = {
  id: string;
  name: string;
  isYou: boolean;
  cents: number;
  groups: { id: string; name: string; cents: number }[];
};

export type DashboardData = {
  me: PersonRef | null;
  peopleCount: number;
  yourCents: number;
  groups: GroupSummary[];
  activity: ActivityItem[];
};

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
