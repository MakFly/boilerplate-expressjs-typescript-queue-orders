import { Moon, Sun } from "lucide-react"

import { Button } from "../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { useTheme } from "./theme-provider"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  
  console.log("Current theme in ModeToggle:", theme)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="border-border">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Changer de thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-border">
        <DropdownMenuItem onClick={() => {
          console.log("Setting theme to light");
          setTheme("light");
        }}>
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          console.log("Setting theme to dark");
          setTheme("dark");
        }}>
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          console.log("Setting theme to system");
          setTheme("system");
        }}>
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
