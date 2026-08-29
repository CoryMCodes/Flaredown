require "rails_helper"

RSpec.describe CheckinReminderMailer, type: :mailer do
  # ApplicationMailer captures the From address into default_params when the class is
  # loaded, so stubbing the config it reads would be too late. Override the stored
  # default instead, rather than depending on whatever SMTP_EMAIL_FROM happens to hold.
  before do
    allow(described_class).to receive(:default_params)
      .and_return(described_class.default_params.merge(from: "from@some.email"))
  end

  describe "checkin reminder email" do
    let(:user_email) { create(:user, email: "test@flaredown.com").email }
    let(:mail) { CheckinReminderMailer.remind(email: user_email) }

    it "renders the headers" do
      expect(mail.subject).to eq(I18n.t("checkin_reminder_mailer.subject"))
      expect(mail.to).to eq([user_email])
      expect(mail.from).to eq(["from@some.email"])
    end

    it "renders the body" do
      body = I18n.t("checkin_reminder_mailer.body.text", base_url: Flaredown.config.base_url)
      expect(mail.body.encoded.strip.tr('\"', "")).to match(body)
    end

    it "renders the attachment" do
      expect(mail.attachments.count).to eq 1
    end
  end
end
