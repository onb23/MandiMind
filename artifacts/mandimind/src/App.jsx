import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext";
import Navbar from "./components/Navbar";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import FarmerInput from "./pages/FarmerInput";
import Decision from "./pages/Decision";
import Comparison from "./pages/Comparison";
import Forecast from "./pages/Forecast";
import Settings from "./pages/Settings";

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <div className="max-w-md mx-auto bg-[#fff9eb] min-h-screen relative">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/input" element={<FarmerInput />} />
            <Route path="/decision" element={<Decision />} />
            <Route path="/compare" element={<Comparison />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
