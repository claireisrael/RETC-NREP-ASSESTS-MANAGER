"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RequestForm } from "../../../components/requests/request-form";
import { ArrowLeft, FileText, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Button } from "../../../components/ui/button";
import { ENUMS } from "../../../lib/appwrite/config";
import { useOrgTheme } from "../../../components/providers/org-theme-provider";

export default function NewRequestPage() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type")?.toLowerCase() || "asset";
  const itemIdParam = searchParams.get("itemId");
  const itemsParam = searchParams.get("items");
  const { theme } = useOrgTheme();

  const { itemType, title, subtitle, icon: Icon } = useMemo(() => {
    if (typeParam === "consumable") {
      return {
        itemType: ENUMS.ITEM_TYPE.CONSUMABLE,
        title: "New Consumable Request",
        subtitle: "Request consumables you need for upcoming work",
        icon: ShoppingCart,
      };
    }
    return {
      itemType: ENUMS.ITEM_TYPE.ASSET,
      title: "New Asset Request",
      subtitle: "Request assets for your project or work needs",
      icon: FileText,
    };
  }, [typeParam]);

  const initialItemIds = useMemo(() => {
    const ids = [];
    if (itemIdParam) ids.push(itemIdParam);
    if (itemsParam) {
      itemsParam.split(",").forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) ids.push(trimmed);
      });
    }
    return [...new Set(ids)];
  }, [itemIdParam, itemsParam]);

  const backgroundColor = theme?.colors?.background || "#f3f4f6";
  const headerAccentFrom = theme?.colors?.primary || "#0E6370";
  const headerAccentTo = theme?.colors?.accent || headerAccentFrom;

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${backgroundColor} 0%, #ffffff 65%)`,
      }}
    >
      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-gray-600 border-gray-300 hover:bg-gray-50"
            >
              <Link href="/requests" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Requests
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="p-3 rounded-xl shadow-inner"
              style={{
                background: `linear-gradient(145deg, ${headerAccentFrom}1A, ${headerAccentTo}33)`,
              }}
            >
              <Icon
                className="w-8 h-8"
                style={{ color: headerAccentFrom }}
              />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
              <p className="text-gray-600 text-lg mt-1">{subtitle}</p>
            </div>
          </div>
        </div>

        <RequestForm itemType={itemType} initialItemIds={initialItemIds} />
      </div>
    </div>
  );
}
