import Link from "next/link";
import { ActivityList } from "@/components/ActivityList";
import { CreateGroupForm } from "@/components/CreateGroupForm";
import { Money } from "@/components/Money";
import { StartForm } from "@/components/StartForm";
import { getDb } from "@/lib/db";
import { balancePhrase, formatSignedCents } from "@/lib/format";
import { getDashboard } from "@/lib/ledger";

export default function HomePage() {
  const data = getDashboard(getDb());

  if (data.peopleCount === 0) {
    return (
      <section className="welcome">
        <p className="eyebrow">Private expense ledger</p>
        <h1 className="page-title">Split shared costs without a spreadsheet.</h1>
        <p className="lede">
          Hearth keeps a group’s expenses on this computer, then turns them into the fewest payments that settle everyone up.
        </p>
        <ul className="feature-list">
          <li>Equal splits, percents, shares, or exact amounts</li>
          <li>More than one person can pay a single expense</li>
          <li>A balance for each group, and for each person overall</li>
        </ul>
        <StartForm />
      </section>
    );
  }

  const tone = data.yourCents > 0 ? "pos" : data.yourCents < 0 ? "neg" : "zero";

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Your balance</p>
          <h1 className="page-title">{data.me ? `Hello, ${data.me.name}` : "Your groups"}</h1>
        </div>
        <CreateGroupForm />
      </header>

      {data.me ? (
        <section className="hero">
          <p className="hero-kicker">Across every group</p>
          <p className={`hero-figure ${tone}`} data-testid="your-balance">
            {formatSignedCents(data.yourCents)}
          </p>
          <p className="hero-caption">{balancePhrase(data.me.name, data.yourCents, true)}</p>
        </section>
      ) : (
        <p className="banner">
          Choose who you are on the <Link href="/people">People</Link> page to see your overall balance.
        </p>
      )}

      <section className="stack">
        <h2 className="section-title">Groups</h2>
        {data.groups.length === 0 ? (
          <p className="empty">Create a group for a trip, a house, or a dinner, then add the people in it.</p>
        ) : (
          <ul className="group-list">
            {data.groups.map((group) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`} className="card-link">
                  <span>
                    <span className="card-title">{group.name}</span>
                    <span className="muted">
                      {group.memberCount} {group.memberCount === 1 ? "person" : "people"}
                    </span>
                  </span>
                  <span className="card-balance">
                    {group.yourCents === null ? (
                      <span className="muted">Not in this group</span>
                    ) : group.yourCents === 0 ? (
                      <span className="money zero">Settled</span>
                    ) : (
                      <>
                        <Money cents={group.yourCents} signed />
                        <span className="muted">{group.yourCents > 0 ? "you're owed" : "you owe"}</span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.activity.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Recent activity</h2>
          </div>
          <ActivityList items={data.activity} showGroup />
        </section>
      ) : null}
    </div>
  );
}
