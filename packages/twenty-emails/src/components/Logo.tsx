import { Img } from 'react-email';

const logoStyle = {
  marginBottom: '40px',
};

export const Logo = () => {
  return (
    <Img
      src="https://app.clawcrm.net/images/claw-logo.png"
      alt="Claw CRM logo"
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};
