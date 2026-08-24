require "rails_helper"

RSpec.describe Checkin::Updater do
  let(:user) { create(:user) }
  let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today) }

  subject { Checkin::Updater.new(user, params).update! }

  context "with permitted params" do
    let(:params) { ActionController::Parameters.new(id: checkin.id.to_s, checkin: {note: "Blah"}) }
    it "returns updated checkin" do
      expect(subject.id).to eq checkin.id
      expect(subject.note).to eq params[:checkin][:note]
    end
  end

  context "with non-permitted params" do
    let(:params) { ActionController::Parameters.new(id: checkin.id.to_s, checkin: {date: Date.yesterday}) }
    it "returns checkin with no changes" do
      expect(subject.id).to eq checkin.id
      expect(subject.date).not_to eq params[:checkin][:date]
    end
  end

  context "when recent dose exists for treatment in user's profile" do
    let(:treatment) { create(:treatment) }

    let(:params) do
      ActionController::Parameters.new(
        id: checkin.id.to_s,
        checkin: {treatments_attributes: [{treatment_id: treatment.id}]}
      )
    end

    before do
      user.profile.set_most_recent_dose(treatment.id, "20 mg")
      user.profile.save!
    end
    it "auto-sets the most recently used dose on added treatments" do
      returned_treatment = subject.treatments[0]
      expect(returned_treatment.treatment_id).to eq treatment.id
      saved_dose = user.profile.most_recent_dose_for(treatment.id)
      expect(returned_treatment.value).to eq saved_dose
    end

    context "and the client sent a dose with the new treatment" do
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {treatments_attributes: [{treatment_id: treatment.id, value: "5 ml", is_taken: "true"}]}
        )
      end

      it "keeps the dose the client sent" do
        expect(subject.treatments[0].value).to eq "5 ml"
      end
    end
  end

  context "when the calendar day has already rolled over in UTC" do
    # 2016-01-06 19:30 in America/Los_Angeles is 2016-01-07 03:30 UTC, so the
    # check-in's calendar date (the 6th) no longer matches Date.current (the 7th).
    # The user is still filling in today's check-in, so their dose and ordering
    # have to be remembered for the next one.
    let(:utc_now) { Time.utc(2016, 1, 7, 3, 30, 0) }
    let(:checkin) { create(:checkin, user_id: user.id, date: DateTime.new(2016, 1, 6, 3, 30, 0)) }
    let(:treatment) { create(:treatment) }
    let!(:checkin_treatment) { create(:checkin_treatment, checkin: checkin, treatment_id: treatment.id) }

    let(:params) do
      ActionController::Parameters.new(
        id: checkin.id.to_s,
        checkin: {
          treatments_attributes: [{
            id: checkin_treatment.id.to_s,
            treatment_id: treatment.id,
            value: "20 mg",
            is_taken: "true",
            position: 3
          }]
        }
      )
    end

    it "remembers the dose for the next check-in" do
      travel_to(utc_now) { subject }

      expect(user.profile.reload.most_recent_dose_for(treatment.id)).to eq "20 mg"
    end

    it "remembers the position for the next check-in" do
      travel_to(utc_now) { subject }

      expect(user.profile.reload.most_recent_trackable_position_for(treatment)).to eq 3
    end

    context "and an older check-in is edited" do
      let!(:latest_checkin) { create(:checkin, user_id: user.id, date: DateTime.new(2016, 1, 7, 3, 30, 0)) }
      let(:checkin) { create(:checkin, user_id: user.id, date: DateTime.new(2016, 1, 5, 3, 30, 0)) }

      it "leaves the remembered dose alone" do
        travel_to(utc_now) { subject }

        expect(user.profile.reload.most_recent_dose_for(treatment.id)).to be_nil
      end

      it "leaves the remembered position alone" do
        travel_to(utc_now) { subject }

        expect(user.profile.reload.most_recent_trackable_position_for(treatment)).to be_nil
      end
    end
  end

  context "trackable usages" do
    context "when removing a trackable" do
      let!(:checkin_condition) { create(:checkin_condition, checkin: checkin) }
      let!(:condition) { Condition.find(checkin_condition.condition_id) }
      let!(:usage) { create(:trackable_usage, user: user, trackable: condition) }
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: [{
              id: checkin_condition.id.to_s,
              condition_id: checkin_condition.condition_id,
              _destroy: "1"
            }]
          }
        )
      end
      context "used once before" do
        it "removes trackable and usage record" do
          expect(subject.conditions.map(&:id)).not_to include checkin_condition.id
          expect(TrackableUsage.find_by(user: user, trackable: condition)).to be_nil
        end
      end
      context "used more than once before" do
        let!(:previous_count) { usage.count }
        before { usage.increment! :count }
        it "removes trackable and decrements count on usage record" do
          expect(subject.conditions.map(&:id)).not_to include checkin_condition.id
          expect(usage.count).to eq(previous_count + 1)
        end
      end
    end

    context "when adding a trackable" do
      let!(:condition) { create(:condition) }
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: [{
              condition_id: condition.id
            }]
          }
        )
      end
      context "never used before" do
        it "adds trackable and creates a new usage record" do
          expect(subject.conditions.map(&:condition_id)).to include condition.id
          expect(TrackableUsage.find_by(user: user, trackable: condition)).to be_present
        end
      end
      context "already used before" do
        let!(:usage) { TrackableUsage.find_or_create_by(user: user, trackable: condition) }
        let!(:previous_count) { usage.count }
        it "adds trackable and increments count on usage record" do
          expect(subject.conditions.map(&:condition_id)).to include condition.id
          expect(usage.reload.count).to eq(previous_count + 1)
        end
      end
    end
  end

  context "trackables positions" do
    let(:n) { 5 }
    let(:trackables) do
      result = []
      n.times do |i|
        result << create(:checkin_condition, checkin: checkin, position: i)
      end
      result
    end
    let(:trackables_attrs) do
      trackables.map do |t|
        {
          id: t.id.to_s,
          condition_id: t.condition_id,
          position: t.position
        }
      end
    end

    context "when adding a trackable and client didn't pass position" do
      let(:condition) { create(:condition) }
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: trackables_attrs + [{condition_id: condition.id}]
          }
        )
      end
      it "auto-sets position to last" do
        added_trackable = subject.conditions.find_by(condition_id: condition.id)
        expect(added_trackable.position).to eq n
      end
    end

    context "when removing a trackable" do
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: trackables_attrs
          }
        )
      end
      let(:pos) { 1 }
      before do
        trackable_to_remove = params[:checkin][:conditions_attributes].find { |a| a[:position].eql? pos }
        trackable_to_remove[:_destroy] = "1"
      end
      it "updates positions of removed trackable's successors" do
        successors_attrs = params[:checkin][:conditions_attributes].select { |a| a[:position] > pos }
        successors_attrs.each do |successor_attrs|
          successor = subject.conditions.find(successor_attrs[:id])
          expect(successor.position).to eq successor_attrs[:position] - 1
        end
      end
    end

    context "when reordering trackables" do
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: trackables_attrs
          }
        )
      end
      before do
        # swap first and last trackable's positions
        attrs = params[:checkin][:conditions_attributes]
        attrs[0][:position] = attrs[trackables_attrs.length - 1][:position]
      end
      context "on today's checkin" do
        it "updates trackables positions in checkin and saves them in profile" do
          params[:checkin][:conditions_attributes].each do |condition_attr|
            checkin_condition = subject.conditions.find(condition_attr[:id])
            expect(checkin_condition.position).to eq condition_attr[:position]
            condition = Condition.find(condition_attr[:condition_id])
            saved_position = user.profile.most_recent_trackable_position_for(condition)
            expect(saved_position).to eq condition_attr[:position]
          end
        end
      end
      context "on a past checkin" do
        # "Past" has to mean "a more recent check-in exists", not "dated before the
        # server's UTC today": those are the same thing to the server, and the second
        # reading also matches today's check-in filled in during the evening.
        let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today - 1.day) }
        let!(:later_checkin) { create(:checkin, user_id: user.id, date: Time.zone.today) }

        it "updates trackables positions in checkin but doesn't save them in profile" do
          params[:checkin][:conditions_attributes].each do |condition_attr|
            checkin_condition = subject.conditions.find(condition_attr[:id])
            expect(checkin_condition.position).to eq condition_attr[:position]
            condition = Condition.find(condition_attr[:condition_id])
            saved_position = user.profile.most_recent_trackable_position_for(condition)
            expect(saved_position).to eq nil
          end
        end
      end
    end
  end
end
