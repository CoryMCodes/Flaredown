require "rails_helper"

describe WeatherRetriever, :vcr do
  # Tomorrowiorb.forecast reads this at call time to build the request URL, and VCR
  # matches on that URL. It has to be the key the cassettes were recorded with, so
  # stub it here rather than depending on whatever TOMORROW_IO_KEY happens to hold.
  before { allow(Tomorrowiorb).to receive(:api_key).and_return("MY_MEGA_TOMORROW_IO_KEY") }

  let(:date) { Date.parse "2016-01-06" }
  let(:cassete) { "#{described_class.name}/#{postal_code}" }
  let(:postal_code) { "55403" }

  let(:perform) do
    VCR.use_cassette cassete do
      described_class.get(date, postal_code)
    end
  end

  context "no weather cached" do
    it { expect(perform).to be_a(Weather) }
    it { expect { perform }.to change { Weather.count }.by(1) }
  end

  context "the weather is already cached" do
    let(:position) { Position.create(postal_code: postal_code) }
    let!(:weather) { create :weather, date: date, position_id: position.id }

    before { expect(Weather).not_to receive(:create) }
    before { expect(Geocoder).not_to receive(:search) }
    before { expect(Tomorrowiorb).not_to receive(:forecast) }

    it { expect(perform).to eq(weather) }
    it { expect { perform }.not_to change { Weather.count } }
  end
end
