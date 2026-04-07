import {
  Button,
  buttonVariants,
} from "./sandbox-ui/button";
import {
  Badge,
  badgeVariants,
} from "./sandbox-ui/badge";
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./sandbox-ui/card";
import { Separator } from "./sandbox-ui/separator";
import { cn } from "./lib/utils";

export type SandboxUI = {
  Button: typeof Button;
  Card: typeof Card;
  CardHeader: typeof CardHeader;
  CardFooter: typeof CardFooter;
  CardTitle: typeof CardTitle;
  CardDescription: typeof CardDescription;
  CardContent: typeof CardContent;
  Badge: typeof Badge;
  Separator: typeof Separator;
  cn: typeof cn;
  buttonVariants: typeof buttonVariants;
  badgeVariants: typeof badgeVariants;
};

const UI: SandboxUI = {
  Button,
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Separator,
  cn,
  buttonVariants,
  badgeVariants,
};

declare global {
  interface Window {
    UI: SandboxUI;
  }
}

window.UI = UI;
