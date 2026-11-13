import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from "./pages/landing"
import RegistrationFlow from "./pages/Register"
import IntakeQuestionnaire from "./pages/Onboarding"
import PatientDashboard from "./pages/Dashboard"
import RiskAssessmentResult from "./pages/RiskAssessmentResult"
import BookAppointment from "./pages/BookApointment"
import EmergencyReporting from "./pages/EmergencyReporting"
import PregnancyEducation from "./pages/PregnancyEducation"
import EducationDetail from "./pages/EducationDetail"
import ProviderDashboard from "./pages/ProviderDashboard"
import PatientDetailPanel from "./pages/PatientDetails"
import PatientProfile from "./pages/PatientProfile"
import ResetPassword from "./pages/ResetPassword"
import VerifyEmail from "./pages/VerifyEmail"
import RecoverAccount from "./pages/RecoverAccount"
import VisitTracker from "./components/VisitTracker"
import { TourProvider } from "./components/AppTour"

export default function App() {
  return (
    <BrowserRouter>
      <VisitTracker />
      <TourProvider>
      <Routes>
        <Route path='/' element={<Landing />} />
        <Route path='/register' element={<RegistrationFlow />} />
        <Route path='/intake' element={<IntakeQuestionnaire />} />
        <Route path='/dashboard' element={<PatientDashboard />} />
        <Route path='/risk-result' element={<RiskAssessmentResult />} />
        <Route path='/appointments' element={<BookAppointment />} />
        <Route path='/emergency' element={<EmergencyReporting />} />
        <Route path='/education' element={<PregnancyEducation />} />
        <Route path='/education/:id' element={<EducationDetail />} />
        <Route path='/provider' element={<ProviderDashboard />} />
        <Route path='/provider/patient' element={<PatientDetailPanel />} />
        <Route path='/profile' element={<PatientProfile />} />
        <Route path='/reset-password' element={<ResetPassword />} />
        <Route path='/verify-email' element={<VerifyEmail />} />
        <Route path='/recover' element={<RecoverAccount />} />
      </Routes>
      </TourProvider>
    </BrowserRouter>
  )
}
