import React from "react";
import { CalendarCheck } from "lucide-react";
import type { LeaveBalance } from "../lib/leave";

interface LeaveBalanceCardsProps {
  balances: LeaveBalance[];
  loading?: boolean;
}

export function LeaveBalanceCards({ balances, loading = false }: LeaveBalanceCardsProps) {
  if (loading) {
    return (
      <div >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            
          >
            <div >
              <div  />
              <div  />
            </div>
            <div  />
            <div  />
          </div>
        ))}
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div >
        <CalendarCheck size={22}  />
        <p >
          No leave policies configured for your company yet.
        </p>
      </div>
    );
  }

  return (
    <div >
      {balances.map((bal) => {
        const remaining = Math.max(0, bal.quota - bal.used);
        const pct = bal.quota > 0 ? Math.min(100, (bal.used / bal.quota) * 100) : 0;
        const isMonthly = bal.quotaPeriod === "monthly";
        return (
          <div
            key={bal.leaveType}
            
          >
            <div >
              <div >
                <CalendarCheck size={15} />
              </div>
              <p >
                {bal.leaveType} Leave
              </p>
              <div >
                <span className={`rounded uppercase${ isMonthly ? "" : "" }`}>
                  {isMonthly ? "Monthly" : "Annual"}
                </span>
              </div>
            </div>

            <div >
              <span >
                {remaining}
              </span>
              <span >
                {isMonthly ? `of ${bal.quota} days/month` : `of ${bal.quota} days/year`} left
              </span>
            </div>

            {/* Progress bar */}
            <div >
              <div
                style={{ width: `${pct}%` }}
                
              />
            </div>

            <p >
              Used {bal.used} {bal.used === 1 ? "day" : "days"} this {isMonthly ? "month" : "year"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
