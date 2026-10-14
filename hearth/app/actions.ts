"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { LedgerError } from "@/lib/errors";
import {
  addMemberByName,
  addPerson,
  createExpense,
  createGroup,
  createSettlement,
  deleteExpense,
  deleteGroup,
  deleteSettlement,
  removeMember,
  setMe,
  startLedger,
} from "@/lib/ledger";
import type { ActionResult, ExpenseInput, SettlementInput } from "@/lib/types";

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof LedgerError) return { ok: false, error: error.message };
  throw error;
}

function refresh(groupId?: string) {
  revalidatePath("/");
  revalidatePath("/people");
  if (groupId) revalidatePath(`/groups/${groupId}`);
}

export async function startLedgerAction(name: string): Promise<ActionResult> {
  try {
    startLedger(getDb(), name);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createGroupAction(name: string): Promise<ActionResult<{ id: string }>> {
  try {
    const id = createGroup(getDb(), name);
    refresh(id);
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function addMemberAction(groupId: string, name: string): Promise<ActionResult> {
  try {
    addMemberByName(getDb(), groupId, name);
    refresh(groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removeMemberAction(groupId: string, personId: string): Promise<ActionResult> {
  try {
    removeMember(getDb(), groupId, personId);
    refresh(groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createExpenseAction(input: ExpenseInput): Promise<ActionResult> {
  try {
    createExpense(getDb(), input);
    refresh(input.groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionResult> {
  try {
    const groupId = deleteExpense(getDb(), expenseId);
    refresh(groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createSettlementAction(input: SettlementInput): Promise<ActionResult> {
  try {
    createSettlement(getDb(), input);
    refresh(input.groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSettlementAction(settlementId: string): Promise<ActionResult> {
  try {
    const groupId = deleteSettlement(getDb(), settlementId);
    refresh(groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  try {
    deleteGroup(getDb(), groupId);
    refresh(groupId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addPersonAction(name: string): Promise<ActionResult> {
  try {
    addPerson(getDb(), name);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setMeAction(personId: string): Promise<ActionResult> {
  try {
    setMe(getDb(), personId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
