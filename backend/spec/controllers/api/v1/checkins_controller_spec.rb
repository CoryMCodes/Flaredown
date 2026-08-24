require "rails_helper"

RSpec.describe Api::V1::CheckinsController do
  let!(:user) { create(:user) }
  let(:date) { "2016-01-06" }

  before { sign_in user }

  describe "index" do
    context "when checkin exists for the requested date" do
      before do
        create(:checkin, date: Date.parse(date), user_id: user.id)
        create(:checkin, date: Date.parse(date) + 1.hour, user_id: user.id)
        create(:checkin, date: Date.parse(date) + 5.days, user_id: user.id)
        create(:checkin, date: Date.parse(date) - 5.days, user_id: user.id)
      end

      it "returns correct checkin" do
        get :index, params: {date: date}
        expect(response_body[:checkins].count).to eq 2
        expect(response_body[:checkins].pluck(:date)).to eq [date, date]
        returned_checkin = response_body[:checkins][0]
        expect(Date.parse(returned_checkin[:date])).to eq Date.parse(date)
      end
    end
    context "when checkin doesn't exist for the passed date" do
      it "returns no results" do
        get :index, params: {date: date}
        expect(response_body[:checkins].count).to eq 0
      end
    end
  end

  describe "create" do
    it "returns new checkin" do
      travel_to(DateTime.new(2020, 1, 2, 3, 4, 5)) do
        post :create, params: {checkin: {date: date}}
        expect(response_body[:checkin][:date]).to eq date
      end

      travel_to(DateTime.new(2020, 1, 2, 3, 4, 6)) do
        post :create, params: {checkin: {date: date}}
      end

      travel_to(DateTime.new(2020, 1, 2, 3, 4, 7)) do
        post :create, params: {checkin: {date: date}}
      end

      # Each POST is a separate check-in for the same day, ordered within it by the
      # clock time #date carries alongside the user's calendar date.
      expect(user.checkins.count).to eq 3
      expect(user.last_checkin.date).to eq(DateTime.new(2016, 1, 6, 3, 4, 7))
    end
  end

  describe "calendar dates" do
    # A user in America/Los_Angeles checking in at 19:30 on 2016-01-06 reaches the
    # server at 2016-01-07 03:30 UTC. The API has to keep reporting 2016-01-06:
    # clients re-read this value in the browser's local timezone, so an ISO
    # timestamp reads back as the previous day for everyone west of UTC.
    let(:utc_now) { Time.utc(2016, 1, 7, 3, 30, 0) }

    it "reports the user's calendar date when creating" do
      travel_to(utc_now) do
        post :create, params: {checkin: {date: date}}

        expect(response_body[:checkin][:date]).to eq date
      end
    end

    it "reports the user's calendar date when showing" do
      travel_to(utc_now) { post :create, params: {checkin: {date: date}} }

      get :show, params: {id: user.last_checkin.id}

      expect(response_body[:checkin][:date]).to eq date
    end

    it "reports the user's calendar date when listing" do
      travel_to(utc_now) { post :create, params: {checkin: {date: date}} }

      get :index, params: {date: date}

      expect(response_body[:checkins].pluck(:date)).to eq [date]
    end
  end

  describe "update" do
    let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today) }
    let(:attributes) { {id: checkin.id, checkin: {note: "Blah"}} }
    it "returns updated checkin" do
      put :update, params: attributes
      returned_checkin = response_body[:checkin]
      expect(returned_checkin[:id]).to eq checkin.id.to_s
      expect(returned_checkin[:note]).to eq attributes[:checkin][:note]
    end
  end

  context "show" do
    describe "for new user" do
      let(:new_user) { create(:user) }
      let(:checkin) { create(:checkin, user_id: new_user.id, date: Time.zone.today) }
      let(:attributes) { {id: checkin.id} }

      it "promotion visiability" do
        get :show, params: attributes
        returned_checkin = response_body[:checkin]
        expect(returned_checkin[:available_for_promotion]).to be false
        expect(returned_checkin[:promotion_skipped_at].blank?).to be true
        expect(returned_checkin[:promotion_rate_id].blank?).to be true
      end
    end

    describe "for user created_at 1 week ago" do
      let(:old_user) { create(:user, created_at: 1.week.ago) }

      context "Promotion rate" do
        describe "start visiability" do
          let(:checkin) { create(:checkin, user_id: old_user.id, date: Time.zone.today) }
          let(:attributes) { {id: checkin.id} }

          it "should be available" do
            get :show, params: attributes
            returned_checkin = response_body[:checkin]
            expect(returned_checkin[:available_for_promotion]).to be true
            expect(returned_checkin[:promotion_skipped_at].blank?).to be true
            expect(returned_checkin[:promotion_rate_id].blank?).to be true
          end
        end

        describe "skipped promotion rate" do
          let(:checkin) { create(:checkin, user_id: old_user.id, promotion_skipped_at: Time.now.utc) }
          let(:attributes) { {id: checkin.id} }

          it "with skipped promotion rate" do
            get :show, params: attributes
            returned_checkin = response_body[:checkin]
            expect(returned_checkin[:available_for_promotion]).to be false
            expect(returned_checkin[:promotion_rate_id].blank?).to be true
          end
        end

        describe "skipped promotion becomes available" do
          let(:checkin) do
            create(:checkin,
              user_id: old_user.id,
              date: Time.zone.today,
              promotion_skipped_at: (Time.zone.today - 1.week))
          end

          let(:attributes) { {id: checkin.id} }

          it "returns false after skipped promotion rate for 1 week" do
            get :show, params: attributes
            returned_checkin = response_body[:checkin]
            expect(returned_checkin[:available_for_promotion]).to be true
          end
        end

        describe "rated promotion becomes unavailable" do
          let(:old_checkin) { create(:checkin, user_id: old_user.id, date: (Time.zone.today - 1.day)) }
          let!(:promotion_rate) { create(:promotion_rate, checkin_id: old_checkin.id) }
          let(:checkin) { create(:checkin, user_id: old_user.id, date: Time.zone.today) }
          let(:attributes) { {id: checkin.id} }

          it "returns false if user has rated" do
            get :show, params: attributes
            returned_checkin = response_body[:checkin]
            expect(returned_checkin[:available_for_promotion]).to be false
          end
        end
      end
    end
  end
end
