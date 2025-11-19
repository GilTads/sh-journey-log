import logo from "@/assets/icon.png";

export const Header = () => {
  return (
    <header className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <img src={logo} alt="Santa Helena" className="h-12 w-auto" />
        </div>
      </div>
    </header>
  );
};
